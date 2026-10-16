import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiClientError, BotApiClient } from "./api-client.js";
import type { BotLogger } from "./logging.js";
import type { VoicePlatform, VoiceTarget } from "./voice.js";

const paginationSchema = z.object({ total: z.number(), limit: z.number(), offset: z.number() }).passthrough();
const searchItemSchema = z.object({
  type: z.enum(["track", "playlist"]),
  id: z.number().int().positive(),
  name: z.string(),
  deleted_at: z.string().nullable(),
  duration: z.number().optional(),
});
const searchSchema = z.object({ data: z.array(searchItemSchema), pagination: paginationSchema });
const trackSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  duration: z.number(),
  deleted_at: z.string().nullable(),
});
const sourceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("all_tracks") }).strict(),
  z.object({ type: z.literal("playlist"), playlist_id: z.number().int().positive() }).strict(),
  z.object({ type: z.literal("most_played") }).strict(),
  z.object({ type: z.literal("my_uploads") }).strict(),
  z.object({ type: z.literal("play_history") }).strict(),
  z.object({ type: z.literal("upload_history") }).strict(),
]);
const randomSchema = z.object({
  track_id: z.number().int().positive(),
  history_event_id: z.number().int().positive().optional(),
  source: sourceSchema,
});
const playbackReportSchema = z.object({ event_id: z.string().uuid(), duplicate: z.boolean() });

export type NamedPoolSource = "all_tracks" | "most_played" | "my_uploads" | "play_history" | "upload_history";
export type PlaybackPool = { type: NamedPoolSource } | { type: "playlist"; name: string };
export type PlaybackKind = "play" | "random" | "raid";

export class PlaybackError extends Error {
  constructor(
    readonly reason: "busy" | "no_channel" | "denied" | "track_not_found" | "playlist_not_found" | "closed" | "failed",
  ) {
    super(reason);
  }
}

export interface PlaybackRequest {
  kind: PlaybackKind;
  actorDiscordId: string;
  guildId: string;
  voiceChannelId: string | null;
  trackName?: string;
  pool?: PlaybackPool;
  limit?: number;
  channelNumber?: number;
}

export class PlaybackService {
  private readonly activeGuilds = new Set<string>();
  private closed = false;

  constructor(
    private readonly api: Pick<BotApiClient, "request" | "requestAudio">,
    private readonly voice: VoicePlatform,
    private readonly log: BotLogger,
  ) {}

  private async exactItem(actorDiscordId: string, name: string, type: "track" | "playlist") {
    const response = await this.api.request(actorDiscordId, "/v1/search", {
      query: { q: name, type: type === "track" ? "tracks" : "playlists", limit: 100, offset: 0 },
      schema: searchSchema,
    });
    return response.data.find((item) => item.type === type && item.name === name && item.deleted_at === null);
  }

  private async trackById(actorDiscordId: string, trackId: number) {
    return this.api.request(actorDiscordId, `/v1/tracks/${trackId}`, { schema: trackSchema });
  }

  private async resolvePool(actorDiscordId: string, pool: PlaybackPool | undefined, limit?: number) {
    if (!pool || pool.type === "all_tracks") return { source: "all_tracks" as const, limit };
    if (pool.type !== "playlist") return { source: pool.type, limit };
    const playlist = await this.exactItem(actorDiscordId, pool.name, "playlist");
    if (!playlist) throw new PlaybackError("playlist_not_found");
    return { source: "playlist" as const, playlist_id: playlist.id, limit };
  }

  private async reportStarted(
    actorDiscordId: string,
    trackId: number,
    kind: PlaybackKind,
    source?: z.infer<typeof sourceSchema>,
  ) {
    const report = {
      event_id: randomUUID(),
      track_id: trackId,
      play_type: kind,
      playback_started: true as const,
      ...(source ? { source } : {}),
    };
    const response = await this.api.request(actorDiscordId, "/v1/plays/events", {
      method: "POST",
      json: report,
      schema: playbackReportSchema,
    });
    this.log.info(
      { component: "playback", command: kind, reason: response.duplicate ? "duplicate" : "recorded" },
      "playback.reported",
    );
  }

  async play(request: PlaybackRequest): Promise<string> {
    if (this.closed) throw new PlaybackError("closed");
    if (this.activeGuilds.has(request.guildId)) throw new PlaybackError("busy");
    this.activeGuilds.add(request.guildId);
    try {
      let target: VoiceTarget | undefined;
      if (request.channelNumber !== undefined) {
        target = this.voice.numberedChannel(request.guildId, request.channelNumber);
      } else {
        target = this.voice.callerChannel(request.guildId, request.voiceChannelId);
      }
      if (!target) throw new PlaybackError("no_channel");

      let track: z.infer<typeof trackSchema>;
      let source: z.infer<typeof sourceSchema> | undefined;
      if (request.kind === "random") {
        const selection = await this.api.request(request.actorDiscordId, "/v1/library/pools/random", {
          query: await this.resolvePool(request.actorDiscordId, request.pool, request.limit),
          schema: randomSchema,
        });
        track = await this.trackById(request.actorDiscordId, selection.track_id);
        source = selection.source;
      } else {
        if (!request.trackName) throw new PlaybackError("track_not_found");
        const match = await this.exactItem(request.actorDiscordId, request.trackName, "track");
        if (!match) throw new PlaybackError("track_not_found");
        track = await this.trackById(request.actorDiscordId, match.id);
      }

      const audio = await this.api.requestAudio(request.actorDiscordId, `/v1/tracks/${track.id}/stream`);
      let reported = false;
      await this.voice.play(target, audio, async () => {
        if (reported) return;
        reported = true;
        try {
          await this.reportStarted(request.actorDiscordId, track.id, request.kind, source);
        } catch (error) {
          this.log.error(
            {
              component: "playback",
              reason: error instanceof ApiClientError ? error.kind : "report_failed",
              command: request.kind,
            },
            "playback.report.failed",
          );
        }
      });
      return `Finished playing ${track.name}.`;
    } catch (error) {
      if (error instanceof PlaybackError || error instanceof ApiClientError) throw error;
      if (error instanceof Error && error.message === "voice_permission_denied") throw new PlaybackError("denied");
      if (error instanceof Error && error.message === "voice_channel_missing") throw new PlaybackError("no_channel");
      this.log.warn({ component: "playback", reason: "voice_or_stream_failed" }, "playback.failed");
      throw new PlaybackError("failed");
    } finally {
      this.activeGuilds.delete(request.guildId);
    }
  }

  close(): void {
    this.closed = true;
    this.voice.close();
    this.activeGuilds.clear();
  }
}

export function playbackUserMessage(error: PlaybackError): string {
  switch (error.reason) {
    case "busy":
      return "Something is already playing in this server. Try again after it finishes.";
    case "no_channel":
      return "Join a voice channel first, or choose an available numbered channel.";
    case "denied":
      return "I cannot connect to or speak in that voice channel.";
    case "track_not_found":
      return "No active track matched that exact name.";
    case "playlist_not_found":
      return "No active playlist matched that exact name.";
    case "closed":
      return "Playback is shutting down. Try again later.";
    default:
      return "Playback could not be completed. Please try again later.";
  }
}

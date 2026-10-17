import { z } from "zod";
import { ApiClientError, discordIdSchema, type BotApiClient } from "./api-client.js";
import type { BotLogger } from "./logging.js";
import { PlaybackError, type PlaybackService } from "./playback.js";

const greetingSchema = z
  .object({
    greeting_track_id: z.number().int().positive().nullable(),
    greeting_playlist_id: z.number().int().positive().nullable(),
  })
  .passthrough();
const farewellSchema = z
  .object({
    farewell_track_id: z.number().int().positive().nullable(),
    farewell_playlist_id: z.number().int().positive().nullable(),
  })
  .passthrough();
export interface VoiceStateUpdate {
  id: string;
  guildId?: string;
  guild?: { id: string };
  channelId: string | null;
  member?: { user?: { bot?: boolean } | null } | null;
}

type Api = Pick<BotApiClient, "request">;
type Playback = Pick<PlaybackService, "play">;

export class AutomaticVoiceEvents {
  private closed = false;

  constructor(
    private readonly api: Api,
    private readonly playback: Playback,
    private readonly log: BotLogger,
    private readonly isCurrentState: (guildId: string, userId: string, channelId: string | null) => boolean,
  ) {}

  async handle(oldState: VoiceStateUpdate, newState: VoiceStateUpdate): Promise<void> {
    const oldGuildId = oldState.guildId ?? oldState.guild?.id;
    const guildId = newState.guildId ?? newState.guild?.id;
    if (
      this.closed ||
      !guildId ||
      oldGuildId !== guildId ||
      oldState.id !== newState.id ||
      !discordIdSchema.safeParse(newState.id).success ||
      oldState.member?.user?.bot ||
      newState.member?.user?.bot
    )
      return;

    const joining = oldState.channelId === null && newState.channelId !== null;
    const leaving = oldState.channelId !== null && newState.channelId === null;
    if (!joining && !leaving) return;

    const userId = newState.id;
    const targetChannelId = joining ? newState.channelId : oldState.channelId;
    const kind = joining ? "greeting" : "farewell";
    try {
      const greeting = joining
        ? await this.api.request(userId, "/v1/users/@me/greeting", { schema: greetingSchema })
        : undefined;
      const farewell = leaving
        ? await this.api.request(userId, "/v1/users/@me/farewell", { schema: farewellSchema })
        : undefined;
      if (this.closed || !this.isCurrentState(guildId, userId, newState.channelId)) {
        this.log.debug({ component: "voice_events", command: kind, reason: "stale_transition" }, "voice_event.skipped");
        return;
      }

      if (joining) {
        if (greeting!.greeting_track_id !== null) {
          await this.playback.play({
            kind: "greeting",
            actorDiscordId: userId,
            guildId,
            voiceChannelId: targetChannelId,
            trackId: greeting!.greeting_track_id,
          });
        } else if (greeting!.greeting_playlist_id !== null) {
          await this.playback.play({
            kind: "playlist_greeting",
            actorDiscordId: userId,
            guildId,
            voiceChannelId: targetChannelId,
            playlistId: greeting!.greeting_playlist_id,
          });
        } else {
          this.skip(kind, "not_configured");
        }
      } else {
        if (farewell!.farewell_track_id !== null) {
          await this.playback.play({
            kind: "farewell",
            actorDiscordId: userId,
            guildId,
            voiceChannelId: targetChannelId,
            trackId: farewell!.farewell_track_id,
          });
        } else if (farewell!.farewell_playlist_id !== null) {
          await this.playback.play({
            kind: "farewell",
            actorDiscordId: userId,
            guildId,
            voiceChannelId: targetChannelId,
            playlistId: farewell!.farewell_playlist_id,
            maxDuration: 4,
          });
        } else {
          this.skip(kind, "not_configured");
        }
      }
    } catch (error) {
      const reason =
        error instanceof PlaybackError ? error.reason : error instanceof ApiClientError ? error.kind : "failed";
      this.log.warn({ component: "voice_events", command: kind, guildId, reason }, "voice_event.failed");
    }
  }

  private skip(command: string, reason: string) {
    this.log.debug({ component: "voice_events", command, reason }, "voice_event.skipped");
  }

  close(): void {
    this.closed = true;
  }
}

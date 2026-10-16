import { z } from "zod";
import { PLAYBACK_KIND_TO_TYPE, PlaybackKind, PLAY_TYPE } from "../services/playsService";

export const logTracksPlayBodySchema = z
  .object({
    track_id: z.number().int(),
    play_type: z.union([
      z.literal(PLAY_TYPE.PLAY),
      z.literal(PLAY_TYPE.PLAY_RANDOM),
      z.literal(PLAY_TYPE.GREETING),
      z.literal(PLAY_TYPE.RAID),
      z.literal(PLAY_TYPE.FAREWELL),
      z.literal(PLAY_TYPE.PLAYLIST_GREETING),
    ]),
  })
  .strict();

export const logRandomPlaylistsPlayBodySchema = z
  .object({
    playlist_id: z.number().int(),
  })
  .strict();

const playbackSourceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("playlist"), playlist_id: z.number().int().positive() }).strict(),
  z.object({ type: z.literal("all_tracks") }).strict(),
  z.object({ type: z.literal("most_played") }).strict(),
  z.object({ type: z.literal("my_uploads") }).strict(),
  z.object({ type: z.literal("play_history") }).strict(),
  z.object({ type: z.literal("upload_history") }).strict(),
]);

export const playbackEventBodySchema = z
  .object({
    event_id: z
      .string()
      .uuid()
      .transform((value) => value.toLowerCase()),
    track_id: z.number().int().positive(),
    play_type: z.enum(["play", "random", "greeting", "raid", "farewell", "playlist_greeting"]),
    source: playbackSourceSchema.optional(),
    playback_started: z.literal(true),
  })
  .strict()
  .superRefine(({ play_type, source }, context) => {
    if (play_type === "random" && !source) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["source"], message: "Random play requires a source" });
    }
    if (play_type === "playlist_greeting" && source?.type !== "playlist") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["source"],
        message: "Playlist greeting requires a playlist source",
      });
    }
    if (source?.type === "playlist" && play_type !== "random" && play_type !== "playlist_greeting") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["source"],
        message: "Playlist sources are only valid for random and playlist-greeting plays",
      });
    }
    if (source && source.type !== "playlist" && play_type !== "random") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["source"],
        message: "Pool sources are only valid for random plays",
      });
    }
  })
  .transform(({ event_id, track_id, play_type, source }) => ({
    event_id,
    track_id,
    play_type: PLAYBACK_KIND_TO_TYPE[play_type as PlaybackKind],
    source_type: source?.type ?? "direct",
    ...(source?.type === "playlist" ? { playlist_id: source.playlist_id } : {}),
  }));

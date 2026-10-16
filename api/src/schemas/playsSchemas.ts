import { z } from "zod";
import { PLAY_TYPE } from "../services/playsService";

export const logTracksPlayBodySchema = z
  .object({
    track_id: z.number().int(),
    play_type: z.union([
      z.literal(PLAY_TYPE.PLAY),
      z.literal(PLAY_TYPE.PLAY_RANDOM),
      z.literal(PLAY_TYPE.GREETING),
      z.literal(PLAY_TYPE.RAID),
      z.literal(PLAY_TYPE.FAREWELL),
      z.literal(PLAY_TYPE.CATEGORY_GREETING),
    ]),
  })
  .strict();

export const logRandomPlaylistsPlayBodySchema = z
  .object({
    playlist_id: z.number().int(),
  })
  .strict();

export const playbackEventBodySchema = logTracksPlayBodySchema
  .extend({
    event_id: z
      .string()
      .uuid()
      .transform((value) => value.toLowerCase()),
    track_id: z.number().int().positive(),
    playlist_id: z.number().int().positive().optional(),
    playback_started: z.literal(true),
  })
  .strict();

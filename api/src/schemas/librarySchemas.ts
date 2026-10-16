import { z } from "zod";

export const poolSourceTypes = [
  "all_tracks",
  "playlist",
  "most_played",
  "my_uploads",
  "play_history",
  "upload_history",
] as const;

const poolSelectorFields = {
  source: z.enum(poolSourceTypes),
  playlist_id: z.coerce.number().int().positive().optional(),
};

function validatePoolSelector(
  value: { source: (typeof poolSourceTypes)[number]; playlist_id?: number },
  context: z.RefinementCtx,
) {
  if (value.source === "playlist" && value.playlist_id === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "playlist_id is required when source is playlist" });
  }
  if (value.source !== "playlist" && value.playlist_id !== undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "playlist_id is only valid when source is playlist" });
  }
}

function toPoolSource(source: (typeof poolSourceTypes)[number], playlist_id?: number): PoolSource {
  return source === "playlist" ? { type: source, playlist_id: playlist_id! } : { type: source };
}

export type PoolSource =
  | { type: "all_tracks" }
  | { type: "playlist"; playlist_id: number }
  | { type: "most_played" }
  | { type: "my_uploads" }
  | { type: "play_history" }
  | { type: "upload_history" };

const poolQueryBase = z.object(poolSelectorFields).strict();

export const poolQuerySchema = poolQueryBase
  .extend({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().min(0).max(2_147_483_647).default(0),
  })
  .strict()
  .superRefine(validatePoolSelector)
  .transform(({ source, playlist_id, ...options }) => ({ source: toPoolSource(source, playlist_id), ...options }));

export const randomPoolQuerySchema = poolQueryBase
  .extend({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    max_duration: z.coerce.number().positive().max(15).optional(),
  })
  .strict()
  .superRefine(validatePoolSelector)
  .transform(({ source, playlist_id, ...options }) => ({ source: toPoolSource(source, playlist_id), ...options }));

export type PoolQuery = z.infer<typeof poolQuerySchema>;
export type RandomPoolQuery = z.infer<typeof randomPoolQuerySchema>;

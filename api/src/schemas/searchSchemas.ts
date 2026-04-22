import { z } from "zod";
import { Config } from "../config/config";

export type SearchType = "all" | "tracks" | "playlists" | "users";
export type SearchSort = "relevance" | "name" | "created_at" | "play_count";
export type SortOrder = "asc" | "desc";

export type UnifiedSearchQuery = {
  q?: string;
  type: SearchType;
  sort: SearchSort;
  order: SortOrder;
  include_deleted: boolean;
  limit: number;
  offset: number;
  playlist_id?: number;
  user_id?: number;
};

export function searchSchemasFactory(config: Config) {
  const searchQuerySchema = z
    .object({
      q: z.string().trim().optional(),
      type: z.enum(["all", "tracks", "playlists", "users"]).default("all"),
      sort: z.enum(["relevance", "name", "created_at", "play_count"]).optional(),
      order: z.enum(["asc", "desc"]).default("desc"),
      // TODO use stringbool after upgrade to ZOD4
      include_deleted: z.boolean().default(false),
      limit: z.coerce.number().int().min(1).max(config.maxResultsPerPage).default(20),
      offset: z.coerce.number().int().min(0).default(0),
      playlist_id: z.coerce.number().int().optional(),
      user_id: z.coerce.number().int().optional(),
    })
    .strict()
    .superRefine((raw, ctx) => {
      const hasQuery = raw.q !== undefined && raw.q.length > 0;
      const sort = raw.sort ?? (hasQuery ? "relevance" : "name");

      if (raw.q !== undefined && raw.q.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["q"],
          message: "Query must be non-empty.",
        });
      }

      if (raw.q !== undefined && raw.q.length > config.maxSearchQueryLength) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["q"],
          message: `Query must be at most ${config.maxSearchQueryLength} characters.`,
        });
      }

      if (sort === "relevance" && !hasQuery) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sort"],
          message: "Sort 'relevance' requires a query (q).",
        });
      }

      if (sort === "play_count" && raw.type !== "tracks") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sort"],
          message: "Sort 'play_count' is only valid with type=tracks.",
        });
      }

      if (raw.playlist_id !== undefined && raw.type !== "tracks") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["playlist_id"],
          message: "playlist_id is only valid with type=tracks.",
        });
      }

      if (raw.user_id !== undefined && raw.type !== "tracks" && raw.type !== "playlists") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["user_id"],
          message: "user_id is only valid with type=tracks or type=playlists.",
        });
      }
    })
    .transform(
      (raw): UnifiedSearchQuery => ({
        ...raw,
        // default of sort is based on query presence
        sort: raw.sort ?? (raw.q ? "relevance" : "name"),
      }),
    );

  return {
    searchQuerySchema,
  };
}

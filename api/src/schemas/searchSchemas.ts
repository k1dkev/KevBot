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
  const RawSearchQuerySchema = z
    .object({
      q: z.string().optional(),
      type: z.enum(["all", "tracks", "playlists", "users"]).optional(),
      sort: z.enum(["relevance", "name", "created_at", "play_count"]).optional(),
      order: z.enum(["asc", "desc"]).optional(),
      include_deleted: z.coerce.boolean().default(false),
      limit: z.coerce.number().int().min(1).max(config.maxResultsPerPage).default(20),
      offset: z.coerce.number().int().min(0).default(0),
      playlist_id: z.coerce.number().int().min(1).optional(),
      user_id: z.coerce.number().int().min(1).optional(),
    })
    .strict();

  const searchQuerySchema: z.ZodType<
    UnifiedSearchQuery,
    any,
    z.input<typeof RawSearchQuerySchema>
  > = RawSearchQuerySchema.transform((raw, ctx) => {
    const type: SearchType = raw.type ?? "all";

    let q: string | undefined;
    if (raw.q !== undefined) {
      const trimmed = raw.q.trim();
      if (trimmed.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["q"],
          message: "Query must be non-empty.",
        });
        return z.NEVER;
      }
      if (trimmed.length > config.maxSearchQueryLength) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["q"],
          message: `Query must be at most ${config.maxSearchQueryLength} characters.`,
        });
        return z.NEVER;
      }
      q = trimmed;
    }

    const hasQuery = q !== undefined;
    const sort: SearchSort = raw.sort ?? (hasQuery ? "relevance" : "name");

    if (sort === "relevance" && !hasQuery) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sort"],
        message: "Sort 'relevance' requires a query (q).",
      });
      return z.NEVER;
    }

    if (sort === "play_count" && type !== "tracks") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sort"],
        message: "Sort 'play_count' is only valid with type=tracks.",
      });
      return z.NEVER;
    }

    if (raw.playlist_id !== undefined && type !== "tracks") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["playlist_id"],
        message: "playlist_id is only valid with type=tracks.",
      });
      return z.NEVER;
    }

    if (raw.user_id !== undefined && type !== "tracks" && type !== "playlists") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["user_id"],
        message: "user_id is only valid with type=tracks or type=playlists.",
      });
      return z.NEVER;
    }

    const order: SortOrder = (() => {
      if (sort === "name") return "asc";
      return "desc";
    })();

    return {
      q,
      type,
      sort,
      order,
      include_deleted: raw.include_deleted,
      limit: raw.limit,
      offset: raw.offset,
      playlist_id: raw.playlist_id,
      user_id: raw.user_id,
    };
  });

  return {
    searchQuerySchema,
  };
}

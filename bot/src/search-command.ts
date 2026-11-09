import { z } from "zod";
import type { ParsedArgs } from "./commands.js";
import type { BotApiClient } from "./api-client.js";

type SearchContext = {
  args: ParsedArgs;
  authorDiscordId: string;
  api: BotApiClient;
};

const searchResponseSchema = z
  .object({
    data: z.array(
      z
        .object({
          type: z.enum(["track", "playlist", "user"]),
          id: z.number().int().positive(),
          name: z.string().nullable(),
          relevance: z.number().nullable().optional(),
          duration: z.number().optional(),
          track_count: z.number().int().nonnegative().optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const resultLimitPerType = 10;
const resultLimit = 10;

function safeText(value: string): string {
  return value
    .replace(/[\r\n\u0000-\u001f\u007f]/g, " ")
    .replaceAll("`", "ˋ")
    .slice(0, 120);
}

export async function searchLibrary({ args, authorDiscordId, api }: SearchContext): Promise<string> {
  const query = args.searchQuery;
  if (!query) throw new Error("Search query was not validated");
  const types =
    args.searchType === "tracks"
      ? ["tracks"]
      : args.searchType === "playlists"
        ? ["playlists"]
        : ["tracks", "playlists"];
  const responses = await Promise.all(
    types.map((type) =>
      api.request(authorDiscordId, "/v1/search", {
        query: { q: query, type, sort: "relevance", order: "desc", limit: resultLimitPerType },
        schema: searchResponseSchema,
      }),
    ),
  );
  const items = responses
    .flatMap((response) => response.data)
    .filter((item) => item.type === "track" || item.type === "playlist")
    .sort((left, right) => {
      const scoreDifference = (right.relevance ?? 0) - (left.relevance ?? 0);
      if (scoreDifference) return scoreDifference;
      if (left.type !== right.type) return left.type === "track" ? -1 : 1;
      return (left.name ?? "").localeCompare(right.name ?? "") || left.id - right.id;
    })
    .slice(0, resultLimit);

  if (!items.length) return "No matching tracks or playlists found.";
  const rows = items.map((item, index) => {
    const name = safeText(item.name ?? `Unknown item #${item.id}`);
    const detail =
      item.type === "track"
        ? item.duration === undefined
          ? "track"
          : `track · ${item.duration.toFixed(1)}s`
        : item.track_count === undefined
          ? "playlist"
          : `playlist · ${item.track_count} tracks`;
    return `${index + 1}. ${name} — ${detail}`;
  });
  return [`Search results for “${safeText(query)}” (${items.length}):`, ...rows].join("\n");
}

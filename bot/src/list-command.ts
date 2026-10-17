import { z } from "zod";
import type { BotApiClient } from "./api-client.js";
import type { ParsedArgs } from "./commands.js";

type ListContext = { args: ParsedArgs; authorDiscordId: string; api: BotApiClient };

const paginationSchema = z
  .object({
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  })
  .passthrough();
const trackItemSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string(),
    playable: z.boolean(),
    unavailable_reason: z.string().nullable(),
    ordinary_play_count: z.number().int().nonnegative().optional(),
    created_at: z.string().optional(),
  })
  .passthrough();
const playEventSchema = z
  .object({
    event_id: z.number().int().positive(),
    track_id: z.number().int().positive(),
    played_at: z.string(),
    play_type: z.number().int(),
    name: z.string().nullable(),
    playable: z.boolean(),
    unavailable_reason: z.string().nullable(),
  })
  .passthrough();
const poolResponseSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tracks"), data: z.array(trackItemSchema), pagination: paginationSchema }).passthrough(),
  z
    .object({ kind: z.literal("play_events"), data: z.array(playEventSchema), pagination: paginationSchema })
    .passthrough(),
]);
const playlistSchema = z.array(z.object({ id: z.number().int().positive(), name: z.string() }).passthrough());

const pageSize = 100;
const maxPages = 100;
const playTypes: Readonly<Record<number, string>> = {
  0: "play",
  1: "random",
  2: "greeting",
  3: "raid",
  4: "farewell",
  5: "playlist greeting",
};

function safeName(value: string | null, trackId: number): string {
  return (value ?? `Unknown track #${trackId}`).replace(/[\r\n\u0000-\u001f\u007f]/g, " ").slice(0, 100);
}

function timestamp(value: string | undefined): string {
  if (!value) return "unknown time";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "unknown time" : `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function unavailable(reason: string | null, playable: boolean): string {
  if (playable) return "";
  const detail =
    reason === "missing_track" ? "missing track" : reason === "deleted_track" ? "deleted track" : "unavailable";
  return ` [${detail}]`;
}

async function resolveSource(context: ListContext) {
  const pool = context.args.pool ?? { type: "all_tracks" as const };
  if (pool.type !== "playlist")
    return { kind: "source" as const, source: pool.type, title: pool.type.replaceAll("_", " ") };
  const playlists = await context.api.request(context.authorDiscordId, "/v1/playlists", {
    query: { name: pool.name },
    schema: playlistSchema,
  });
  const match = playlists.find((playlist) => playlist.name === pool.name);
  if (!match) return { kind: "missing" as const, error: `Playlist '${pool.name}' was not found.` };
  return {
    kind: "source" as const,
    source: "playlist" as const,
    playlistId: match.id,
    title: `playlist '${match.name}'`,
  };
}

async function fetchPage(context: ListContext, source: string, offset: number, limit: number, playlistId?: number) {
  return context.api.request(context.authorDiscordId, "/v1/library/pools", {
    query: { source, playlist_id: playlistId, limit, offset },
    schema: poolResponseSchema,
  });
}

function formatRows(
  kind: "tracks" | "play_events",
  rows: (z.infer<typeof trackItemSchema> | z.infer<typeof playEventSchema>)[],
  source: string,
) {
  if (kind === "play_events") {
    return (rows as z.infer<typeof playEventSchema>[]).map(
      (row, index) =>
        `${index + 1}. ${timestamp(row.played_at)} — ${safeName(row.name, row.track_id)} (${playTypes[row.play_type] ?? "unknown play"})${unavailable(row.unavailable_reason, row.playable)}`,
    );
  }
  return (rows as z.infer<typeof trackItemSchema>[]).map((row, index) => {
    const count = source !== "most_played" ? "" : ` — ${row.ordinary_play_count ?? 0} plays`;
    const uploaded = source !== "upload_history" ? "" : ` — ${timestamp(row.created_at)}`;
    return `${index + 1}. ${safeName(row.name, row.id)}${count}${uploaded}${unavailable(row.unavailable_reason, row.playable)}`;
  });
}

export async function listLibrary(context: ListContext): Promise<string> {
  const resolved = await resolveSource(context);
  if (resolved.kind === "missing") return resolved.error;
  const bounded =
    resolved.source === "most_played" || resolved.source === "play_history" || resolved.source === "upload_history";
  const limit = bounded ? (context.args.limit ?? 25) : pageSize;
  const rows: (z.infer<typeof trackItemSchema> | z.infer<typeof playEventSchema>)[] = [];
  let kind: "tracks" | "play_events" | undefined;
  let total = 0;
  let offset = 0;
  let pages = 0;

  do {
    if (pages >= maxPages) return "This source has too many entries to display in one request.";
    const page = await fetchPage(context, resolved.source, offset, limit, resolved.playlistId);
    if (kind !== undefined && page.kind !== kind) throw new Error("Library source response changed kind between pages");
    kind = page.kind;
    total = page.pagination.total;
    rows.push(...page.data);
    if (bounded) break;
    if (!page.data.length && offset < total) throw new Error("Library source returned an empty page before its end");
    offset += page.data.length;
    pages++;
  } while (offset < total);

  const label = bounded ? `${resolved.title} (${rows.length} of ${total})` : `${resolved.title} (${total})`;
  if (!rows.length) return `No entries in ${label}.`;
  const lines = formatRows(kind!, rows, resolved.source);
  return [`${label}:`, ...lines].join("\n");
}

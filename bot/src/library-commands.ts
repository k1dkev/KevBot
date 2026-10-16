import { z } from "zod";
import { ApiClientError, apiUserMessage, type BotApiClient } from "./api-client.js";
import type { ParsedArgs } from "./commands.js";

type LibraryContext = {
  args: ParsedArgs;
  authorDiscordId: string;
  api: BotApiClient;
};

const playlistSchema = z.object({ id: z.number().int().positive(), name: z.string() }).passthrough();
const searchSchema = z
  .object({
    data: z.array(z.object({ type: z.string(), id: z.number().int().positive(), name: z.string() }).passthrough()),
  })
  .passthrough();
const addTracksSchema = z
  .object({ playlist_id: z.number().int().positive(), added_track_ids: z.array(z.number().int()) })
  .passthrough();
const removeTracksSchema = z
  .object({ deleted_track_ids: z.array(z.number().int()), not_in_playlist_track_ids: z.array(z.number().int()) })
  .passthrough();

const unique = (values: string[]) => [...new Set(values)];

async function mapLimited<T, R>(values: T[], concurrency: number, run: (value: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= values.length) return;
      results[index] = await run(values[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

async function findPlaylist(api: BotApiClient, authorDiscordId: string, name: string) {
  const playlists = await api.request(authorDiscordId, "/v1/playlists", {
    query: { name },
    schema: z.array(playlistSchema),
  });
  return playlists.find((playlist) => playlist.name === name);
}

async function findTrack(api: BotApiClient, authorDiscordId: string, name: string) {
  const result = await api.request(authorDiscordId, "/v1/search", {
    query: { q: name, type: "tracks" },
    schema: searchSchema,
  });
  return result.data.find((item) => item.type === "track" && item.name === name);
}

function appendMissing(lines: string[], missing: string[]) {
  if (missing.length) lines.push(`Not found: ${missing.join(", ")}.`);
}

async function resolveTracks(api: BotApiClient, authorDiscordId: string, names: string[]) {
  const distinct = unique(names);
  const found = await mapLimited(distinct, 6, async (name) => ({
    name,
    track: await findTrack(api, authorDiscordId, name),
  }));
  return {
    found: found.flatMap(({ name, track }) => (track ? [{ name, id: track.id }] : [])),
    missing: found.filter(({ track }) => !track).map(({ name }) => name),
  };
}

async function resolvePlaylists(api: BotApiClient, authorDiscordId: string, names: string[]) {
  const distinct = unique(names);
  const found = await mapLimited(distinct, 6, async (name) => ({
    name,
    playlist: await findPlaylist(api, authorDiscordId, name),
  }));
  return {
    found: found.flatMap(({ name, playlist }) => (playlist ? [{ name, id: playlist.id }] : [])),
    missing: found.filter(({ playlist }) => !playlist).map(({ name }) => name),
  };
}

function apiFailure(error: unknown) {
  if (error instanceof ApiClientError) return apiUserMessage(error);
  return "The operation failed. Check the playlist state before retrying.";
}

export async function createPlaylist({ args, authorDiscordId, api }: LibraryContext) {
  const [name] = args.tokens;
  try {
    const playlist = await api.request(authorDiscordId, "/v1/playlists", {
      method: "POST",
      json: { name },
      schema: playlistSchema,
    });
    return `Created playlist '${playlist.name}'.`;
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 409) return `Playlist '${name}' already exists.`;
    throw error;
  }
}

export async function deletePlaylist({ args, authorDiscordId, api }: LibraryContext) {
  const [name] = args.tokens;
  const playlist = await findPlaylist(api, authorDiscordId, name!);
  if (!playlist) return `Playlist '${name}' was not found.`;
  try {
    await api.request(authorDiscordId, `/v1/playlists/${playlist.id}`, {
      method: "DELETE",
      schema: playlistSchema,
    });
    return `Deleted empty playlist '${name}'.`;
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 409)
      return `Playlist '${name}' must be empty before deletion.`;
    throw error;
  }
}

async function mutateOnePlaylist(context: LibraryContext, remove: boolean) {
  const [playlistName, ...trackNames] = context.args.tokens;
  const playlist = await findPlaylist(context.api, context.authorDiscordId, playlistName!);
  if (!playlist) return `Playlist '${playlistName}' was not found.`;

  const { found, missing } = await resolveTracks(context.api, context.authorDiscordId, trackNames);
  const lines: string[] = [];
  if (!found.length) {
    appendMissing(lines, missing);
    return lines.join("\n") || "No clips were provided.";
  }

  const ids = found.map(({ id }) => id);
  if (remove) {
    const result = await context.api.request(context.authorDiscordId, `/v1/playlists/${playlist.id}/tracks`, {
      method: "DELETE",
      json: { track_ids: ids },
      schema: removeTracksSchema,
    });
    const removed = new Set(result.deleted_track_ids);
    const removedNames = found.filter(({ id }) => removed.has(id)).map(({ name }) => name);
    const absentNames = found.filter(({ id }) => !removed.has(id)).map(({ name }) => name);
    if (removedNames.length) lines.push(`Removed from '${playlistName}': ${removedNames.join(", ")}.`);
    if (absentNames.length) lines.push(`Not in '${playlistName}': ${absentNames.join(", ")}.`);
  } else {
    const result = await context.api.request(context.authorDiscordId, `/v1/playlists/${playlist.id}/tracks`, {
      method: "POST",
      json: { track_ids: ids },
      schema: addTracksSchema,
    });
    const added = new Set(result.added_track_ids);
    const addedNames = found.filter(({ id }) => added.has(id)).map(({ name }) => name);
    const existingNames = found.filter(({ id }) => !added.has(id)).map(({ name }) => name);
    if (addedNames.length) lines.push(`Added to '${playlistName}': ${addedNames.join(", ")}.`);
    if (existingNames.length) lines.push(`Already in '${playlistName}': ${existingNames.join(", ")}.`);
  }
  appendMissing(lines, missing);
  return lines.join("\n");
}

export const addTracksToPlaylist = (context: LibraryContext) => mutateOnePlaylist(context, false);
export const removeTracksFromPlaylist = (context: LibraryContext) => mutateOnePlaylist(context, true);

async function mutateTrackAcrossPlaylists(context: LibraryContext, remove: boolean) {
  const [trackName, ...playlistNames] = context.args.tokens;
  const track = await findTrack(context.api, context.authorDiscordId, trackName!);
  if (!track) return `Clip '${trackName}' was not found.`;

  const { found, missing } = await resolvePlaylists(context.api, context.authorDiscordId, playlistNames);
  const results = await mapLimited(found, 6, async ({ name, id }) => {
    try {
      if (remove) {
        const result = await context.api.request(context.authorDiscordId, `/v1/playlists/${id}/tracks`, {
          method: "DELETE",
          json: { track_ids: [track.id] },
          schema: removeTracksSchema,
        });
        return { name, status: result.deleted_track_ids.includes(track.id) ? "removed" : "not in playlist" };
      }
      const result = await context.api.request(context.authorDiscordId, `/v1/playlists/${id}/tracks`, {
        method: "POST",
        json: { track_ids: [track.id] },
        schema: addTracksSchema,
      });
      return { name, status: result.added_track_ids.includes(track.id) ? "added" : "already present" };
    } catch (error) {
      return { name, status: apiFailure(error) };
    }
  });

  const lines = results.map(({ name, status }) => `${name}: ${status}.`);
  if (missing.length) lines.push(`Playlists not found: ${missing.join(", ")}.`);
  return lines.join("\n");
}

export const addTrackToPlaylists = (context: LibraryContext) => mutateTrackAcrossPlaylists(context, false);
export const removeTrackFromPlaylists = (context: LibraryContext) => mutateTrackAcrossPlaylists(context, true);

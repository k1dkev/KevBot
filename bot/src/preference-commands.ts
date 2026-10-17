import { z } from "zod";
import { ApiClientError, type BotApiClient } from "./api-client.js";
import type { ParsedArgs } from "./commands.js";

type PreferenceContext = {
  args: ParsedArgs;
  authorDiscordId: string;
  api: BotApiClient;
};

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
const trackSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string(),
    duration: z.number(),
    deleted_at: z.string().nullable(),
  })
  .passthrough();
const trackListSchema = z.array(trackSchema);
const playlistSchema = z
  .object({ id: z.number().int().positive(), name: z.string(), deleted_at: z.string().nullable() })
  .passthrough();
const trackSearchSchema = z
  .object({
    data: z.array(
      z
        .object({ type: z.literal("track"), id: z.number().int().positive(), name: z.string(), duration: z.number() })
        .passthrough(),
    ),
  })
  .passthrough();

async function findTrack(api: BotApiClient, actor: string, name: string) {
  const result = await api.request(actor, "/v1/search", {
    query: { q: name, type: "tracks" },
    schema: trackSearchSchema,
  });
  return result.data.find((track) => track.name === name);
}

async function findPlaylist(api: BotApiClient, actor: string, name: string) {
  const playlists = await api.request(actor, "/v1/playlists", {
    query: { name },
    schema: z.array(playlistSchema),
  });
  return playlists.find((playlist) => playlist.name === name);
}

async function getPlaylistTracks(api: BotApiClient, actor: string, id: number) {
  return api.request(actor, `/v1/playlists/${id}/tracks`, { schema: trackListSchema });
}

async function setGreeting(context: PreferenceContext) {
  const [name] = context.args.tokens;
  let trackId: number | null = null;
  let playlistId: number | null = null;

  if (context.args.greetingType !== "playlist") {
    const track = await findTrack(context.api, context.authorDiscordId, name!);
    if (track) trackId = track.id;
  }
  if (context.args.greetingType !== "track") {
    const playlist = await findPlaylist(context.api, context.authorDiscordId, name!);
    if (playlist) playlistId = playlist.id;
  }

  if (trackId !== null && playlistId !== null)
    return `Both a clip and playlist named '${name}' exist. Specify 'file' or 'playlist' to choose one.`;
  if (trackId === null && playlistId === null) return `No clip or playlist named '${name}' was found.`;

  try {
    await context.api.request(context.authorDiscordId, "/v1/users/@me/greeting", {
      method: "PUT",
      json: { greeting_track_id: trackId, greeting_playlist_id: playlistId },
      schema: greetingSchema,
    });
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 400 && playlistId !== null)
      return `Playlist '${name}' must contain at least one clip before it can be a greeting.`;
    throw error;
  }
  return `Set your greeting to ${trackId === null ? "playlist" : "clip"} '${name}'.`;
}

async function getGreeting(context: PreferenceContext) {
  const greeting = await context.api.request(context.authorDiscordId, "/v1/users/@me/greeting", {
    schema: greetingSchema,
  });
  if (greeting.greeting_track_id !== null) {
    try {
      const track = await context.api.request(context.authorDiscordId, `/v1/tracks/${greeting.greeting_track_id}`, {
        schema: trackSchema,
      });
      return track.deleted_at === null
        ? `Your greeting is clip '${track.name}'.`
        : `Your greeting clip '${track.name}' has been deleted and is unavailable.`;
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 404)
        return "Your configured greeting clip is unavailable or deleted.";
      throw error;
    }
  }
  if (greeting.greeting_playlist_id !== null) {
    try {
      const playlist = await context.api.request(
        context.authorDiscordId,
        `/v1/playlists/${greeting.greeting_playlist_id}`,
        {
          schema: playlistSchema,
        },
      );
      if (playlist.deleted_at !== null)
        return `Your greeting playlist '${playlist.name}' has been deleted and is unavailable.`;
      const tracks = await getPlaylistTracks(context.api, context.authorDiscordId, playlist.id);
      return tracks.length
        ? `Your greeting playlist is '${playlist.name}'.`
        : `Your greeting playlist '${playlist.name}' is empty and cannot currently be used.`;
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 404)
        return "Your configured greeting playlist is unavailable or deleted.";
      throw error;
    }
  }
  return "No greeting is configured.";
}

async function deleteGreeting(context: PreferenceContext) {
  await context.api.request(context.authorDiscordId, "/v1/users/@me/greeting", {
    method: "PUT",
    json: { greeting_track_id: null, greeting_playlist_id: null },
    schema: greetingSchema,
  });
  return "Cleared your greeting.";
}

async function setFarewell(context: PreferenceContext) {
  const [name] = context.args.tokens;
  const track = await findTrack(context.api, context.authorDiscordId, name!);
  if (!track) return `Clip '${name}' was not found.`;
  if (track.duration >= 4)
    return `Clip '${name}' is ${track.duration} seconds; farewell clips must be shorter than 4 seconds.`;
  await context.api.request(context.authorDiscordId, "/v1/users/@me/farewell", {
    method: "PUT",
    json: { farewell_track_id: track.id, farewell_playlist_id: null },
    schema: farewellSchema,
  });
  return `Set your farewell to clip '${name}'.`;
}

async function getFarewell(context: PreferenceContext) {
  const farewell = await context.api.request(context.authorDiscordId, "/v1/users/@me/farewell", {
    schema: farewellSchema,
  });
  if (farewell.farewell_track_id !== null) {
    try {
      const track = await context.api.request(context.authorDiscordId, `/v1/tracks/${farewell.farewell_track_id}`, {
        schema: trackSchema,
      });
      if (track.deleted_at !== null) return `Your farewell clip '${track.name}' has been deleted and is unavailable.`;
      if (track.duration >= 4)
        return `Your farewell clip '${track.name}' is no longer valid because it is 4 seconds or longer.`;
      return `Your farewell is clip '${track.name}'.`;
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 404)
        return "Your configured farewell clip is unavailable or deleted.";
      throw error;
    }
  }
  if (farewell.farewell_playlist_id !== null) {
    try {
      const playlist = await context.api.request(
        context.authorDiscordId,
        `/v1/playlists/${farewell.farewell_playlist_id}`,
        {
          schema: playlistSchema,
        },
      );
      if (playlist.deleted_at !== null)
        return `Your farewell playlist '${playlist.name}' has been deleted and is unavailable.`;
      const tracks = await getPlaylistTracks(context.api, context.authorDiscordId, playlist.id);
      if (!tracks.length) return `Your farewell playlist '${playlist.name}' is empty and cannot currently be used.`;
      if (tracks.some((track) => track.duration >= 4))
        return `Your farewell playlist '${playlist.name}' is no longer valid because it contains a clip 4 seconds or longer.`;
      return `Your farewell playlist is '${playlist.name}'.`;
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 404)
        return "Your configured farewell playlist is unavailable or deleted.";
      throw error;
    }
  }
  return "No farewell is configured.";
}

async function deleteFarewell(context: PreferenceContext) {
  await context.api.request(context.authorDiscordId, "/v1/users/@me/farewell", {
    method: "PUT",
    json: { farewell_track_id: null, farewell_playlist_id: null },
    schema: farewellSchema,
  });
  return "Cleared your farewell.";
}

export const preferenceCommands = {
  setGreeting,
  getGreeting,
  deleteGreeting,
  setFarewell,
  getFarewell,
  deleteFarewell,
};

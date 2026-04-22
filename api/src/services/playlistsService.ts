import { getTrackBaseQuery } from "./tracksService";
import * as Boom from "@hapi/boom";
import { Playlist } from "../db/schema";
import { KevbotDb } from "../db/connection";
import { Config } from "../config/config";

export function playlistsServiceFactory(db: KevbotDb, config: Config) {
  interface PlaylistOptions {
    name?: string;
    include_deleted?: boolean;
  }

  const validatePlaylistNameIsUnique = async (name: string, excludeId?: number) => {
    let query = db.selectFrom("playlists").selectAll().where("name", "=", name).where("deleted_at", "is", null);
    if (excludeId) {
      query = query.where("id", "!=", excludeId);
    }
    const playlist = await query.executeTakeFirst();
    if (playlist) {
      throw Boom.conflict("Playlist name is already taken");
    }
  };

  const playlistPermissionCheck = (playlist: Playlist, req_user_id: number) => {
    if (playlist.user_id !== req_user_id) {
      throw Boom.forbidden("You do not have permission to modify this playlist.");
    }
  };

  const getPlaylists = async (options: PlaylistOptions = {}) => {
    const { name, include_deleted = false } = options;
    let query = db.selectFrom("playlists").selectAll();
    if (name) {
      query = query.where("name", "=", name);
    }
    if (!include_deleted) {
      query = query.where("deleted_at", "is", null);
    }
    return await query.execute();
  };

  const getPlaylistById = async (id: number) => {
    const playlist = await db.selectFrom("playlists").selectAll().where("id", "=", id).executeTakeFirst();
    if (!playlist) {
      throw Boom.notFound("Playlist not found");
    }
    return playlist;
  };

  const patchPlaylist = async (id: number, name: string, req_user_id: number) => {
    const playlist = await getPlaylistById(id);
    playlistPermissionCheck(playlist, req_user_id);
    await validatePlaylistNameIsUnique(name, id);
    if (playlist.name === name) {
      return playlist;
    }
    await db.updateTable("playlists").set({ name }).where("id", "=", id).execute();
    return await getPlaylistById(id);
  };

  const deletePlaylist = async (id: number, req_user_id: number) => {
    const playlist = await getPlaylistById(id);
    playlistPermissionCheck(playlist, req_user_id);
    await db
      .updateTable("playlists")
      .set({ deleted_at: new Date() })
      .where("id", "=", id)
      .where("deleted_at", "is", null)
      .execute();
    return await getPlaylistById(id);
  };

  const restorePlaylist = async (id: number, req_user_id: number, name?: string) => {
    const playlist = await getPlaylistById(id);
    playlistPermissionCheck(playlist, req_user_id);
    await patchPlaylist(id, name ?? playlist.name, req_user_id);
    await db.updateTable("playlists").set({ deleted_at: null }).where("id", "=", id).execute();
    return await getPlaylistById(id);
  };

  const postPlaylist = async (name: string, req_user_id: number) => {
    return await db.transaction().execute(async (trx) => {
      await validatePlaylistNameIsUnique(name);
      const { insertId } = await trx
        .insertInto("playlists")
        .values({ name, user_id: req_user_id })
        .executeTakeFirstOrThrow();
      const playlist = await trx
        .selectFrom("playlists")
        .selectAll()
        .where("id", "=", Number(insertId))
        .executeTakeFirstOrThrow();
      return playlist;
    });
  };

  const getPlaylistTracks = async (id: number) => {
    await getPlaylistById(id); // ensures playlist exists
    return await getTrackBaseQuery(db)
      .innerJoin("playlist_tracks", "t.id", "playlist_tracks.track_id")
      .where("playlist_tracks.playlist_id", "=", id)
      .where("t.deleted_at", "is", null)
      .execute();
  };

  const postPlaylistTracks = async (id: number, track_ids: number[], req_user_id: number) => {
    await getPlaylistById(id); // ensures playlist exists

    // ensures tracks are valid
    const validTrackIds = await db.selectFrom("tracks").select("id").where("id", "in", track_ids).execute();
    const validTrackIdSet = new Set(validTrackIds.map((track) => track.id));
    const invalidTrackIds = track_ids.filter((track_id) => !validTrackIdSet.has(track_id));
    if (invalidTrackIds.length > 0) {
      throw Boom.notFound("Track(s) not found", { invalid_track_ids: invalidTrackIds });
    }

    return await db.transaction().execute(async (trx) => {
      const inPlaylistTrackIds = await trx
        .selectFrom("playlist_tracks")
        .select("track_id")
        .where("playlist_id", "=", id)
        .where("track_id", "in", Array.from(validTrackIdSet))
        .execute();
      const inPlaylistTrackIdSet = new Set(inPlaylistTrackIds.map((track) => track.track_id));
      const notInPlaylistTrackIds = Array.from(validTrackIdSet).filter(
        (track_id) => !inPlaylistTrackIdSet.has(track_id)
      );

      if (notInPlaylistTrackIds.length > 0) {
        await trx
          .insertInto("playlist_tracks")
          .values(
            notInPlaylistTrackIds.map((track_id) => ({
              track_id,
              playlist_id: id,
              user_id: req_user_id,
            }))
          )
          .execute();
      }

      return {
        message: "Tracks added successfully to the playlist.",
        playlist_id: id,
        added_track_ids: notInPlaylistTrackIds,
      };
    });
  };

  const deletePlaylistTracks = async (id: number, track_ids: number[], req_user_id: number) => {
    const playlist = await getPlaylistById(id); // ensures playlist exists
    playlistPermissionCheck(playlist, req_user_id);
    if (track_ids.length == 0) {
      throw Boom.badRequest("track_ids array cannot be empty.");
    }
    return await db.transaction().execute(async (trx) => {
      const trackIdSet = new Set(track_ids);
      const inPlaylistTrackIdSet = new Set(
        (
          await trx
            .selectFrom("playlist_tracks")
            .select("track_id")
            .where("playlist_id", "=", id)
            .where("track_id", "in", Array.from(trackIdSet))
            .execute()
        ).map((result) => result.track_id)
      );

      await trx
        .deleteFrom("playlist_tracks")
        .where("playlist_id", "=", id)
        .where("track_id", "in", Array.from(trackIdSet))
        .execute();

      return {
        message: "Playlist track deletion complete.",
        deleted_track_ids: Array.from(inPlaylistTrackIdSet),
        not_in_playlist_track_ids: Array.from(trackIdSet).filter((id) => !inPlaylistTrackIdSet.has(id)),
      };
    });
  };

  return {
    getPlaylists,
    getPlaylistById,
    patchPlaylist,
    deletePlaylist,
    restorePlaylist,
    postPlaylist,
    getPlaylistTracks,
    postPlaylistTracks,
    deletePlaylistTracks,
  };
}

export type PlaylistsService = ReturnType<typeof playlistsServiceFactory>;

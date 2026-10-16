import { KevbotDb } from "../db/connection";
import { PlaylistsService } from "./playlistsService";
import { TracksService } from "./tracksService";
import { Transaction } from "kysely";
import { Database } from "../db/schema";
import * as Boom from "@hapi/boom";
import { assertMutablePlaylistName } from "./libraryPolicy";

export const PLAY_TYPE = {
  PLAY: 0,
  PLAY_RANDOM: 1,
  GREETING: 2,
  RAID: 3,
  FAREWELL: 4,
  CATEGORY_GREETING: 5,
} as const;

export type PlayType = (typeof PLAY_TYPE)[keyof typeof PLAY_TYPE];

export const PLAY_TYPES_OF_TOTAL_PLAY_COUNT: PlayType[] = [PLAY_TYPE.PLAY, PLAY_TYPE.RAID, PLAY_TYPE.PLAY_RANDOM];

export function playsServiceFactory(db: KevbotDb, tracksService: TracksService, playlistsService: PlaylistsService) {
  interface LogOptions {
    user_id?: number;
  }

  const recordTrackPlay = async (
    trx: Transaction<Database>,
    track_id: number,
    play_type: PlayType,
    user_id?: number,
  ) => {
    await trx.insertInto("track_plays").values({ track_id, play_type, user_id }).execute();

    // Increment raw_total_play_count
    await trx
      .insertInto("track_play_counts")
      .values({
        track_id,
        raw_total_play_count: 1,
      })
      .onDuplicateKeyUpdate((eb) => ({
        raw_total_play_count: eb("raw_total_play_count", "+", 1),
      }))
      .execute();

    // Increment total_play_count if needed
    if (PLAY_TYPES_OF_TOTAL_PLAY_COUNT.includes(play_type)) {
      await trx
        .updateTable("track_play_counts")
        .where("track_id", "=", track_id)
        .set((eb) => ({
          total_play_count: eb("total_play_count", "+", 1),
        }))
        .execute();
    }

    // Increment play_type count
    await trx
      .insertInto("track_play_type_counts")
      .values({
        track_id,
        play_type,
        play_count: 1,
      })
      .onDuplicateKeyUpdate((eb) => ({
        play_type,
        play_count: eb("play_count", "+", 1),
      }))
      .execute();
  };

  const logTracksPlay = async (track_id: number, play_type: PlayType, options: LogOptions = {}) => {
    await db.transaction().execute(async (trx) => {
      await tracksService.getTrackById(track_id, trx);
      await recordTrackPlay(trx, track_id, play_type, options.user_id);
    });
  };

  interface PlaybackEvent {
    event_id: string;
    track_id: number;
    play_type: PlayType;
    playlist_id?: number;
  }
  const reportPlayback = async (event: PlaybackEvent, userId: number) => {
    const values = {
      event_id: event.event_id,
      track_id: event.track_id,
      play_type: event.play_type,
      playlist_id: event.playlist_id ?? null,
      user_id: userId,
    };
    const checkPrior = (
      prior: { user_id: number; track_id: number; play_type: number; playlist_id: number | null } | undefined,
    ) => {
      if (
        !prior ||
        prior.user_id !== userId ||
        prior.track_id !== event.track_id ||
        prior.play_type !== event.play_type ||
        prior.playlist_id !== (event.playlist_id ?? null)
      )
        throw Boom.conflict("Playback event identity was already used for a different report");
      return { event_id: event.event_id, duplicate: true };
    };
    const prior = await db
      .selectFrom("playback_events")
      .selectAll()
      .where("event_id", "=", event.event_id)
      .executeTakeFirst();
    if (prior) return checkPrior(prior);
    try {
      await db.transaction().execute(async (trx) => {
        const track = await tracksService.getTrackById(event.track_id, trx);
        if (track.deleted_at) throw Boom.notFound("Track not found");
        if (event.play_type === PLAY_TYPE.FAREWELL && track.duration >= 4)
          throw Boom.badRequest("Farewell duration must be less than 4 seconds");
        if (event.play_type === PLAY_TYPE.CATEGORY_GREETING && event.playlist_id === undefined)
          throw Boom.badRequest("Category greeting requires a real playlist selection");
        if (event.playlist_id !== undefined) {
          const playlist = await trx
            .selectFrom("playlists")
            .selectAll()
            .where("id", "=", event.playlist_id)
            .where("deleted_at", "is", null)
            .executeTakeFirst();
          if (!playlist) throw Boom.notFound("Playlist not found");
          assertMutablePlaylistName(playlist.name);
          if (event.play_type !== PLAY_TYPE.PLAY_RANDOM && event.play_type !== PLAY_TYPE.CATEGORY_GREETING)
            throw Boom.badRequest("Only random/category-greeting events may report a real playlist selection");
          const member = await trx
            .selectFrom("playlist_tracks")
            .select("track_id")
            .where("playlist_id", "=", event.playlist_id)
            .where("track_id", "=", event.track_id)
            .executeTakeFirst();
          if (!member) throw Boom.badRequest("Track is not a member of the selected playlist");
        }
        // Reserve identity before log/count writes, with every write in one transaction.
        await trx.insertInto("playback_events").values(values).execute();
        if (event.playlist_id !== undefined)
          await trx.insertInto("playlist_plays").values({ playlist_id: event.playlist_id, user_id: userId }).execute();
        await recordTrackPlay(trx, event.track_id, event.play_type, userId);
      });
      return { event_id: event.event_id, duplicate: false };
    } catch (error) {
      if ((error as { code?: string }).code !== "ER_DUP_ENTRY") throw error;
      // InnoDB waits for the first writer before returning duplicate-key failure.
      const prior = await db
        .selectFrom("playback_events")
        .selectAll()
        .where("event_id", "=", event.event_id)
        .executeTakeFirst();
      return checkPrior(prior);
    }
  };

  const logRandomPlaylistPlay = async (playlist_id: number, options: LogOptions = {}) => {
    await db.transaction().execute(async (trx) => {
      await playlistsService.getPlaylistById(playlist_id); // ensures playlist exists
      const { user_id } = options;
      await trx.insertInto("playlist_plays").values({ playlist_id, user_id }).execute();
    });
  };

  return {
    logTracksPlay,
    logRandomPlaylistPlay,
    reportPlayback,
  };
}

export type PlaysService = ReturnType<typeof playsServiceFactory>;

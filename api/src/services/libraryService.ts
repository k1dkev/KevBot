import * as Boom from "@hapi/boom";
import { sql } from "kysely";
import { KevbotDb } from "../db/connection";
import { PoolQuery, PoolSource } from "../schemas/librarySchemas";

export function libraryServiceFactory(db: KevbotDb) {
  const isHistory = (source: PoolSource) => source.type === "play_history" || source.type === "upload_history";
  const isBounded = (source: PoolSource) => isHistory(source) || source.type === "most_played";
  const pagination = (total: number, { limit, offset }: PoolQuery) => ({
    total,
    limit,
    offset,
    hasNext: offset + limit < total,
    hasPrev: offset > 0,
  });

  const trackQuery = async (source: PoolSource, actorId?: number) => {
    let query = db
      .selectFrom("tracks as t")
      .leftJoin("track_play_type_counts as pc", (join) =>
        join.onRef("pc.track_id", "=", "t.id").on("pc.play_type", "=", 0),
      )
      .select([
        "t.id",
        "t.name",
        "t.duration",
        "t.user_id",
        "t.created_at",
        "t.deleted_at",
        sql<number>`COALESCE(pc.play_count, 0)`.as("ordinary_play_count"),
      ]);
    if (source.type !== "upload_history") query = query.where("t.deleted_at", "is", null);
    if (source.type === "my_uploads") {
      if (!actorId) throw Boom.unauthorized("my_uploads requires an acting user");
      query = query.where("t.user_id", "=", actorId);
    } else if (source.type === "most_played") {
      query = query.where("pc.play_count", ">", 0);
    } else if (source.type === "playlist") {
      const playlist = await db
        .selectFrom("playlists")
        .select("id")
        .where("id", "=", source.playlist_id)
        .where("deleted_at", "is", null)
        .executeTakeFirst();
      if (!playlist) throw Boom.notFound("Playlist not found");
      query = query.where((eb) =>
        eb.exists(
          eb
            .selectFrom("playlist_tracks as pt")
            .select("pt.track_id")
            .whereRef("pt.track_id", "=", "t.id")
            .where("pt.playlist_id", "=", playlist.id),
        ),
      );
    }
    if (source.type === "most_played") query = query.orderBy("pc.play_count", "desc").orderBy("t.name").orderBy("t.id");
    else if (source.type === "upload_history") query = query.orderBy("t.created_at", "desc").orderBy("t.id", "desc");
    else query = query.orderBy("t.name").orderBy("t.id");
    // Kysely builders are thenable. Wrap to prevent async-function return
    // assimilation from executing the query before callers add count/page clauses.
    return { query };
  };

  const historyQuery = () =>
    db
      .selectFrom("track_plays as e")
      .leftJoin("tracks as t", "t.id", "e.track_id")
      .select([
        "e.id as event_id",
        "e.track_id",
        "e.played_at",
        "e.play_type",
        "e.user_id as actor_id",
        "t.name",
        "t.duration",
        "t.deleted_at",
      ])
      .orderBy("e.played_at", "desc")
      .orderBy("e.id", "desc");

  const listPool = async (source: PoolSource, options: PoolQuery, actorId?: number) => {
    if (source.type === "play_history") {
      const query = historyQuery();
      const count = await query
        .clearOrderBy()
        .clearSelect()
        .select((eb) => eb.fn.countAll<number>().as("total"))
        .executeTakeFirstOrThrow();
      const rows = await query.limit(options.limit).offset(options.offset).execute();
      return {
        kind: "play_events",
        data: rows.map((row) => ({
          ...row,
          playable: row.name !== null && row.deleted_at === null,
          unavailable_reason: row.name === null ? "missing_track" : row.deleted_at ? "deleted_track" : null,
        })),
        pagination: pagination(Number(count.total), options),
      };
    }
    const { query } = await trackQuery(source, actorId);
    const count = await query
      .clearOrderBy()
      .clearSelect()
      .select((eb) => eb.fn.countAll<number>().as("total"))
      .executeTakeFirstOrThrow();
    const rows = await query.limit(options.limit).offset(options.offset).execute();
    return {
      kind: "tracks",
      data: rows.map((row) => ({
        ...row,
        playable: row.deleted_at === null,
        unavailable_reason: row.deleted_at ? "deleted_track" : null,
      })),
      pagination: pagination(Number(count.total), options),
    };
  };

  const randomFromPool = async (source: PoolSource, limit: number, actorId?: number, maxDuration?: number) => {
    if (source.type === "play_history") {
      // Window events first: repeats retain their weight, unavailable entries stay visible in lists.
      let query = db
        .selectFrom(historyQuery().limit(limit).as("candidates"))
        .selectAll()
        .where("name", "is not", null)
        .where("deleted_at", "is", null);
      if (maxDuration !== undefined) query = query.where("duration", "<", maxDuration);
      const event = await query
        .orderBy(sql`RAND()`)
        .limit(1)
        .executeTakeFirst();
      if (!event) throw Boom.notFound("Pool has no eligible tracks");
      return { track_id: event.track_id, history_event_id: event.event_id, source };
    }
    let { query: candidates } = await trackQuery(source, actorId);
    if (isBounded(source)) candidates = candidates.limit(limit);
    let query = db.selectFrom(candidates.as("candidates")).selectAll().where("deleted_at", "is", null);
    if (maxDuration !== undefined) query = query.where("duration", "<", maxDuration);
    const track = await query
      .orderBy(sql`RAND()`)
      .limit(1)
      .executeTakeFirst();
    if (!track) throw Boom.notFound("Pool has no eligible tracks");
    return { track_id: track.id, source };
  };
  return { listPool, randomFromPool };
}

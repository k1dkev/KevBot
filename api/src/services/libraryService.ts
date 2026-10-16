import * as Boom from "@hapi/boom";
import { sql } from "kysely";
import { KevbotDb } from "../db/connection";
import { PoolQuery } from "../schemas/librarySchemas";
import { RESERVED_POOL_NAMES } from "./libraryPolicy";

export function libraryServiceFactory(db: KevbotDb) {
  const isCategoryList = (name: string) => ["categories", "cats", "emptycats"].includes(name);
  const isHistory = (name: string) => ["playhistory", "uploadhistory"].includes(name);
  const isBounded = (name: string) => isHistory(name) || name === "mostplayed";
  const pagination = (total: number, { limit, offset }: PoolQuery) => ({
    total,
    limit,
    offset,
    hasNext: offset + limit < total,
    hasPrev: offset > 0,
  });

  const trackQuery = async (name: string, actorId?: number) => {
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
    if (name !== "uploadhistory") query = query.where("t.deleted_at", "is", null);
    if (name === "myuploads") {
      if (!actorId) throw Boom.unauthorized("myuploads requires an acting user");
      query = query.where("t.user_id", "=", actorId);
    } else if (name === "mostplayed") {
      query = query.where("pc.play_count", ">", 0);
    } else if (!["all", "uploadhistory"].includes(name)) {
      const playlist = await db
        .selectFrom("playlists")
        .select("id")
        .where("name", "=", name)
        .where("deleted_at", "is", null)
        .executeTakeFirst();
      if (!playlist) throw Boom.notFound("Category or pool not found");
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
    if (name === "mostplayed") query = query.orderBy("pc.play_count", "desc").orderBy("t.name").orderBy("t.id");
    else if (name === "uploadhistory") query = query.orderBy("t.created_at", "desc").orderBy("t.id", "desc");
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

  const listPool = async (name: string, options: PoolQuery, actorId?: number) => {
    if (isCategoryList(name)) {
      let query = db
        .selectFrom("playlists as p")
        .where("p.deleted_at", "is", null)
        .select(["p.id", "p.name", "p.user_id"]);
      if (name === "emptycats")
        query = query.where((eb) =>
          eb.not(
            eb.exists(
              eb
                .selectFrom("playlist_tracks as pt")
                .innerJoin("tracks as t", "t.id", "pt.track_id")
                .select("pt.track_id")
                .whereRef("pt.playlist_id", "=", "p.id")
                .where("t.deleted_at", "is", null),
            ),
          ),
        );
      const count = await query
        .clearSelect()
        .select((eb) => eb.fn.countAll<number>().as("total"))
        .executeTakeFirstOrThrow();
      const data = await query.orderBy("p.name").orderBy("p.id").limit(options.limit).offset(options.offset).execute();
      return { kind: "categories", data, pagination: pagination(Number(count.total), options) };
    }
    if (name === "playhistory") {
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
    const { query } = await trackQuery(name, actorId);
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

  const randomFromPool = async (name: string, limit: number, actorId?: number, maxDuration?: number) => {
    if (isCategoryList(name)) throw Boom.badRequest("Category-list pools are not playable");
    if (name === "playhistory") {
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
      return { track_id: event.track_id, history_event_id: event.event_id };
    }
    let { query: candidates } = await trackQuery(name, actorId);
    if (isBounded(name)) candidates = candidates.limit(limit);
    let query = db.selectFrom(candidates.as("candidates")).selectAll().where("deleted_at", "is", null);
    if (maxDuration !== undefined) query = query.where("duration", "<", maxDuration);
    const track = await query
      .orderBy(sql`RAND()`)
      .limit(1)
      .executeTakeFirst();
    if (!track) throw Boom.notFound("Pool has no eligible tracks");
    const playlist = RESERVED_POOL_NAMES.has(name)
      ? undefined
      : await db
          .selectFrom("playlists")
          .select("id")
          .where("name", "=", name)
          .where("deleted_at", "is", null)
          .executeTakeFirst();
    return { track_id: track.id, ...(playlist ? { playlist_id: playlist.id } : {}) };
  };
  return { listPool, randomFromPool };
}

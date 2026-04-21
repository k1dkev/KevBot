import { sql } from "kysely";
import { Config } from "../config/config";
import { KevbotDb } from "../db/connection";
import { UnifiedSearchQuery, SearchSort, SortOrder } from "../schemas/searchSchemas";

type UnifiedUser = { id: number; display_name: string | null };

export type UnifiedSearchItem =
  | {
      type: "track";
      id: number;
      name: string;
      created_at: Date;
      deleted_at: Date | null;
      relevance: number | null;
      duration: number;
      total_play_count: number;
      raw_total_play_count: number;
      user: UnifiedUser;
    }
  | {
      type: "playlist";
      id: number;
      name: string;
      created_at: Date;
      deleted_at: Date | null;
      relevance: number | null;
      track_count: number;
      user: UnifiedUser;
    }
  | {
      type: "user";
      id: number;
      name: string | null;
      created_at: Date;
      deleted_at: null;
      relevance: number | null;
    };

export type UnifiedSearchResponse = {
  data: UnifiedSearchItem[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    has_next: boolean;
    has_prev: boolean;
  };
};

type EntityResult = { data: UnifiedSearchItem[]; total: number };

const typeRank = (t: UnifiedSearchItem["type"]): number => (t === "track" ? 0 : t === "playlist" ? 1 : 2);

const compareItems = (a: UnifiedSearchItem, b: UnifiedSearchItem, sort: SearchSort, order: SortOrder): number => {
  const dir = order === "asc" ? 1 : -1;
  const tieBreak = typeRank(a.type) - typeRank(b.type) || a.id - b.id;

  if (sort === "name") {
    const an = a.name ?? "";
    const bn = b.name ?? "";
    const cmp = an.localeCompare(bn);
    return cmp !== 0 ? cmp * dir : tieBreak;
  }
  if (sort === "created_at") {
    const cmp = a.created_at.getTime() - b.created_at.getTime();
    return cmp !== 0 ? cmp * dir : tieBreak;
  }
  // relevance
  const ar = a.relevance ?? 0;
  const br = b.relevance ?? 0;
  const cmp = ar - br;
  return cmp !== 0 ? cmp * dir : tieBreak;
};

export function searchServiceFactory(db: KevbotDb, config: Config) {
  const paginate = (total: number, limit: number, offset: number) => ({
    total,
    limit,
    offset,
    has_next: offset + limit < total,
    has_prev: offset > 0,
  });

  const trackOrderExpr = (sort: SearchSort) => {
    if (sort === "name") return sql`t.name`;
    if (sort === "created_at") return sql`t.created_at`;
    if (sort === "play_count") return sql`COALESCE(tpc.total_play_count, 0)`;
    // relevance unreachable here without q; handled separately
    return sql`t.created_at`;
  };

  const searchTracks = async (query: UnifiedSearchQuery): Promise<EntityResult> => {
    const { q, sort, order, include_deleted, limit, offset, user_id, playlist_id } = query;
    const hybridRatio = config.hybridRelevanceRatio;

    if (q === undefined) {
      // browse
      const rows = await db
        .selectFrom("tracks as t")
        .leftJoin("users as u", "t.user_id", "u.id")
        .leftJoin("track_play_counts as tpc", "t.id", "tpc.track_id")
        .$if(!include_deleted, (qb) => qb.where("t.deleted_at", "is", null))
        .$if(user_id !== undefined, (qb) => qb.where("t.user_id", "=", user_id!))
        .$if(playlist_id !== undefined, (qb) =>
          qb.where((eb) =>
            eb.exists(
              eb
                .selectFrom("playlist_tracks as pt")
                .select("pt.track_id")
                .where("pt.playlist_id", "=", playlist_id!)
                .whereRef("pt.track_id", "=", "t.id")
            )
          )
        )
        .select(({ fn }) => [
          "t.id",
          "t.name",
          "t.duration",
          "t.user_id",
          "t.deleted_at",
          "t.created_at",
          fn.coalesce("tpc.total_play_count", sql<number>`0`).as("total_play_count"),
          fn.coalesce("tpc.raw_total_play_count", sql<number>`0`).as("raw_total_play_count"),
          sql<string | null>`u.discord_username`.as("user_display_name"),
          sql<number>`COUNT(*) OVER ()`.as("total_rows"),
        ])
        .orderBy(trackOrderExpr(sort), order)
        .orderBy("t.id", "asc")
        .limit(limit)
        .offset(offset)
        .execute();

      const total = rows.length ? rows[0].total_rows : 0;
      const data: UnifiedSearchItem[] = rows.map((r) => ({
        type: "track",
        id: r.id,
        name: r.name,
        created_at: r.created_at,
        deleted_at: r.deleted_at,
        relevance: null,
        duration: r.duration,
        total_play_count: r.total_play_count,
        raw_total_play_count: r.raw_total_play_count,
        user: { id: r.user_id ?? 0, display_name: r.user_display_name },
      }));
      return { data, total };
    }

    // hybrid search
    const rows = await db
      .with("scored", (qb) =>
        qb
          .selectFrom("tracks as t")
          .selectAll()
          .select([
            sql<number>`MATCH(t.name) AGAINST (${q} IN NATURAL LANGUAGE MODE)`.as("rel"),
            sql<boolean>`t.name LIKE CONCAT(${q}, '%')`.as("is_prefix"),
          ])
          .$if(!include_deleted, (x) => x.where("t.deleted_at", "is", null))
          .$if(user_id !== undefined, (x) => x.where("t.user_id", "=", user_id!))
          .$if(playlist_id !== undefined, (x) =>
            x.where((eb) =>
              eb.exists(
                eb
                  .selectFrom("playlist_tracks as pt")
                  .select("pt.track_id")
                  .where("pt.playlist_id", "=", playlist_id!)
                  .whereRef("pt.track_id", "=", "t.id")
              )
            )
          )
          .where((eb) =>
            eb.or([
              sql<boolean>`t.name LIKE CONCAT(${q}, '%')`,
              sql<boolean>`MATCH(t.name) AGAINST (${q} IN NATURAL LANGUAGE MODE)`,
            ])
          )
      )
      .with("aug", (qb) =>
        qb.selectFrom("scored as s").selectAll().select(sql<number>`MAX(s.rel) OVER ()`.as("max_rel"))
      )
      .with("kept", (qb) =>
        qb
          .selectFrom("aug as s")
          .selectAll()
          .where((eb) =>
            eb.or([
              sql<boolean>`s.is_prefix = 1`,
              eb.and([sql<boolean>`s.rel > 0`, sql<boolean>`s.rel >= ${hybridRatio} * s.max_rel`]),
            ])
          )
      )
      .selectFrom("kept as s")
      .leftJoin("users as u", "s.user_id", "u.id")
      .leftJoin("track_play_counts as tpc", "s.id", "tpc.track_id")
      .select(({ fn }) => [
        "s.id",
        "s.name",
        "s.duration",
        "s.user_id",
        "s.deleted_at",
        "s.created_at",
        fn.coalesce("tpc.total_play_count", sql<number>`0`).as("total_play_count"),
        fn.coalesce("tpc.raw_total_play_count", sql<number>`0`).as("raw_total_play_count"),
        sql<number>`s.rel`.as("relevance"),
        sql<string | null>`u.discord_username`.as("user_display_name"),
        sql<number>`COUNT(*) OVER ()`.as("total_rows"),
      ])
      .$if(sort === "name", (qb) => qb.orderBy("s.name", order).orderBy("s.id", "asc"))
      .$if(sort === "created_at", (qb) => qb.orderBy("s.created_at", order).orderBy("s.id", "asc"))
      .$if(sort === "play_count", (qb) =>
        qb.orderBy(sql`COALESCE(tpc.total_play_count, 0)`, order).orderBy("s.id", "asc")
      )
      .$if(sort === "relevance", (qb) =>
        qb
          .orderBy(sql`CASE WHEN s.is_prefix = 1 THEN 0 ELSE 1 END`, "asc")
          .orderBy(sql`CASE WHEN s.is_prefix = 1 THEN s.name ELSE NULL END`, "asc")
          .orderBy("s.rel", "desc")
          .orderBy("s.name", "asc")
      )
      .limit(limit)
      .offset(offset)
      .execute();

    const total = rows.length ? rows[0].total_rows : 0;
    const data: UnifiedSearchItem[] = rows.map((r) => ({
      type: "track",
      id: r.id,
      name: r.name,
      created_at: r.created_at,
      deleted_at: r.deleted_at,
      relevance: r.relevance,
      duration: r.duration,
      total_play_count: r.total_play_count,
      raw_total_play_count: r.raw_total_play_count,
      user: { id: r.user_id ?? 0, display_name: r.user_display_name },
    }));
    return { data, total };
  };

  const playlistOrderExpr = (sort: SearchSort) => {
    if (sort === "name") return sql`p.name`;
    if (sort === "created_at") return sql`p.created_at`;
    return sql`p.name`;
  };

  const searchPlaylists = async (query: UnifiedSearchQuery): Promise<EntityResult> => {
    const { q, sort, order, include_deleted, limit, offset, user_id } = query;
    const hybridRatio = config.hybridRelevanceRatio;
    const trackCountExpr = sql<number>`(SELECT COUNT(*) FROM playlist_tracks pt WHERE pt.playlist_id = p.id)`;

    if (q === undefined) {
      const rows = await db
        .selectFrom("playlists as p")
        .leftJoin("users as u", "p.user_id", "u.id")
        .$if(!include_deleted, (qb) => qb.where("p.deleted_at", "is", null))
        .$if(user_id !== undefined, (qb) => qb.where("p.user_id", "=", user_id!))
        .select([
          "p.id",
          "p.name",
          "p.user_id",
          "p.created_at",
          "p.deleted_at",
          trackCountExpr.as("track_count"),
          sql<string | null>`u.discord_username`.as("user_display_name"),
          sql<number>`COUNT(*) OVER ()`.as("total_rows"),
        ])
        .orderBy(playlistOrderExpr(sort), order)
        .orderBy("p.id", "asc")
        .limit(limit)
        .offset(offset)
        .execute();

      const total = rows.length ? rows[0].total_rows : 0;
      const data: UnifiedSearchItem[] = rows.map((r) => ({
        type: "playlist",
        id: r.id,
        name: r.name,
        created_at: r.created_at,
        deleted_at: r.deleted_at,
        relevance: null,
        track_count: Number(r.track_count),
        user: { id: r.user_id, display_name: r.user_display_name },
      }));
      return { data, total };
    }

    const rows = await db
      .with("scored", (qb) =>
        qb
          .selectFrom("playlists as p")
          .selectAll()
          .select([
            sql<number>`MATCH(p.name) AGAINST (${q} IN NATURAL LANGUAGE MODE)`.as("rel"),
            sql<boolean>`p.name LIKE CONCAT(${q}, '%')`.as("is_prefix"),
          ])
          .$if(!include_deleted, (x) => x.where("p.deleted_at", "is", null))
          .$if(user_id !== undefined, (x) => x.where("p.user_id", "=", user_id!))
          .where((eb) =>
            eb.or([
              sql<boolean>`p.name LIKE CONCAT(${q}, '%')`,
              sql<boolean>`MATCH(p.name) AGAINST (${q} IN NATURAL LANGUAGE MODE)`,
            ])
          )
      )
      .with("aug", (qb) =>
        qb.selectFrom("scored as s").selectAll().select(sql<number>`MAX(s.rel) OVER ()`.as("max_rel"))
      )
      .with("kept", (qb) =>
        qb
          .selectFrom("aug as s")
          .selectAll()
          .where((eb) =>
            eb.or([
              sql<boolean>`s.is_prefix = 1`,
              eb.and([sql<boolean>`s.rel > 0`, sql<boolean>`s.rel >= ${hybridRatio} * s.max_rel`]),
            ])
          )
      )
      .selectFrom("kept as s")
      .leftJoin("users as u", "s.user_id", "u.id")
      .select([
        "s.id",
        "s.name",
        "s.user_id",
        "s.created_at",
        "s.deleted_at",
        sql<number>`s.rel`.as("relevance"),
        sql<number>`(SELECT COUNT(*) FROM playlist_tracks pt WHERE pt.playlist_id = s.id)`.as("track_count"),
        sql<string | null>`u.discord_username`.as("user_display_name"),
        sql<number>`COUNT(*) OVER ()`.as("total_rows"),
      ])
      .$if(sort === "name", (qb) => qb.orderBy("s.name", order).orderBy("s.id", "asc"))
      .$if(sort === "created_at", (qb) => qb.orderBy("s.created_at", order).orderBy("s.id", "asc"))
      .$if(sort === "relevance", (qb) =>
        qb
          .orderBy(sql`CASE WHEN s.is_prefix = 1 THEN 0 ELSE 1 END`, "asc")
          .orderBy(sql`CASE WHEN s.is_prefix = 1 THEN s.name ELSE NULL END`, "asc")
          .orderBy("s.rel", "desc")
          .orderBy("s.name", "asc")
      )
      .limit(limit)
      .offset(offset)
      .execute();

    const total = rows.length ? rows[0].total_rows : 0;
    const data: UnifiedSearchItem[] = rows.map((r) => ({
      type: "playlist",
      id: r.id,
      name: r.name,
      created_at: r.created_at,
      deleted_at: r.deleted_at,
      relevance: r.relevance,
      track_count: Number(r.track_count),
      user: { id: r.user_id, display_name: r.user_display_name },
    }));
    return { data, total };
  };

  const userOrderExpr = (sort: SearchSort) => {
    if (sort === "name") return sql`u.discord_username`;
    if (sort === "created_at") return sql`u.created_at`;
    return sql`u.discord_username`;
  };

  const searchUsers = async (query: UnifiedSearchQuery): Promise<EntityResult> => {
    const { q, sort, order, limit, offset } = query;
    const hybridRatio = config.hybridRelevanceRatio;

    if (q === undefined) {
      const rows = await db
        .selectFrom("users as u")
        .select([
          "u.id",
          "u.discord_username",
          "u.created_at",
          sql<number>`COUNT(*) OVER ()`.as("total_rows"),
        ])
        .orderBy(sql`u.discord_username IS NULL`, "asc")
        .orderBy(userOrderExpr(sort), order)
        .orderBy("u.id", "asc")
        .limit(limit)
        .offset(offset)
        .execute();

      const total = rows.length ? rows[0].total_rows : 0;
      const data: UnifiedSearchItem[] = rows.map((r) => ({
        type: "user",
        id: r.id,
        name: r.discord_username,
        created_at: r.created_at,
        deleted_at: null,
        relevance: null,
      }));
      return { data, total };
    }

    const rows = await db
      .with("scored", (qb) =>
        qb
          .selectFrom("users as u")
          .select([
            "u.id",
            "u.discord_id",
            "u.discord_username",
            "u.created_at",
            sql<number>`MATCH(u.discord_username) AGAINST (${q} IN NATURAL LANGUAGE MODE)`.as("rel"),
            sql<boolean>`u.discord_username LIKE CONCAT(${q}, '%')`.as("is_prefix"),
            sql<boolean>`u.discord_id LIKE CONCAT(${q}, '%')`.as("is_id_prefix"),
          ])
          .where((eb) =>
            eb.or([
              sql<boolean>`u.discord_username LIKE CONCAT(${q}, '%')`,
              sql<boolean>`u.discord_id LIKE CONCAT(${q}, '%')`,
              sql<boolean>`MATCH(u.discord_username) AGAINST (${q} IN NATURAL LANGUAGE MODE)`,
            ])
          )
      )
      .with("aug", (qb) =>
        qb.selectFrom("scored as s").selectAll().select(sql<number>`MAX(s.rel) OVER ()`.as("max_rel"))
      )
      .with("kept", (qb) =>
        qb
          .selectFrom("aug as s")
          .selectAll()
          .where((eb) =>
            eb.or([
              sql<boolean>`s.is_prefix = 1`,
              sql<boolean>`s.is_id_prefix = 1`,
              eb.and([sql<boolean>`s.rel > 0`, sql<boolean>`s.rel >= ${hybridRatio} * s.max_rel`]),
            ])
          )
      )
      .selectFrom("kept as s")
      .select([
        "s.id",
        "s.discord_username",
        "s.created_at",
        sql<number>`s.rel`.as("relevance"),
        sql<number>`COUNT(*) OVER ()`.as("total_rows"),
      ])
      .$if(sort === "name", (qb) => qb.orderBy("s.discord_username", order).orderBy("s.id", "asc"))
      .$if(sort === "created_at", (qb) => qb.orderBy("s.created_at", order).orderBy("s.id", "asc"))
      .$if(sort === "relevance", (qb) =>
        qb
          .orderBy(sql`CASE WHEN s.is_prefix = 1 THEN 0 ELSE 1 END`, "asc")
          .orderBy(sql`CASE WHEN s.is_prefix = 1 THEN s.discord_username ELSE NULL END`, "asc")
          .orderBy(sql`CASE WHEN s.is_id_prefix = 1 THEN 0 ELSE 1 END`, "asc")
          .orderBy("s.rel", "desc")
          .orderBy("s.discord_username", "asc")
      )
      .limit(limit)
      .offset(offset)
      .execute();

    const total = rows.length ? rows[0].total_rows : 0;
    const data: UnifiedSearchItem[] = rows.map((r) => ({
      type: "user",
      id: r.id,
      name: r.discord_username,
      created_at: r.created_at,
      deleted_at: null,
      relevance: r.relevance,
    }));
    return { data, total };
  };

  const searchAll = async (query: UnifiedSearchQuery): Promise<UnifiedSearchResponse> => {
    const n = query.limit + query.offset;
    const subQuery: UnifiedSearchQuery = { ...query, limit: n, offset: 0 };

    const [tracks, playlists, users] = await Promise.all([
      searchTracks(subQuery),
      searchPlaylists(subQuery),
      searchUsers(subQuery),
    ]);

    const merged: UnifiedSearchItem[] = [...tracks.data, ...playlists.data, ...users.data];
    merged.sort((a, b) => compareItems(a, b, query.sort, query.order));
    const page = merged.slice(query.offset, query.offset + query.limit);
    const total = tracks.total + playlists.total + users.total;

    return { data: page, pagination: paginate(total, query.limit, query.offset) };
  };

  const search = async (query: UnifiedSearchQuery): Promise<UnifiedSearchResponse> => {
    switch (query.type) {
      case "tracks": {
        const { data, total } = await searchTracks(query);
        return { data, pagination: paginate(total, query.limit, query.offset) };
      }
      case "playlists": {
        const { data, total } = await searchPlaylists(query);
        return { data, pagination: paginate(total, query.limit, query.offset) };
      }
      case "users": {
        const { data, total } = await searchUsers(query);
        return { data, pagination: paginate(total, query.limit, query.offset) };
      }
      case "all":
        return searchAll(query);
    }
  };

  return { search };
}

export type SearchService = ReturnType<typeof searchServiceFactory>;

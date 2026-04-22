import { RawBuilder, sql, Kysely, Transaction } from "kysely";
import { Config } from "../config/config";
import { KevbotDb } from "../db/connection";
import { Database } from "../db/schema";
import { SearchSort, SortOrder, UnifiedSearchQuery } from "../schemas/searchSchemas";

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

type Row = {
  entity_type: "track" | "playlist" | "user";
  type_rank: number;
  id: number;
  name: string | null;
  created_at: Date;
  deleted_at: Date | null;
  owner_id: number | null;
  owner_display_name: string | null;
  duration: number | null;
  total_play_count: number | null;
  raw_total_play_count: number | null;
  track_count: number | null;
  relevance: number | null;
  total_rows: number;
};

export function searchServiceFactory(db: KevbotDb, _config: Config) {
  // AI generated
  async function searchV1(query: UnifiedSearchQuery): Promise<UnifiedSearchResponse> {
    const scoreExpr = (q: string, nameCol: RawBuilder<unknown>) => sql`(
      (${nameCol} = ${q}) * 14
      + (${nameCol} LIKE CONCAT(${q}, '%')) * 12
      + (${nameCol} LIKE CONCAT('%', ${q}, '%')) * 10
      + MATCH(${nameCol}) AGAINST (${q} IN NATURAL LANGUAGE MODE)
    )`;

    const matchFilter = (q: string, nameCol: RawBuilder<unknown>) => sql`(
      ${nameCol} LIKE CONCAT('%', ${q}, '%')
      OR MATCH(${nameCol}) AGAINST (${q} IN NATURAL LANGUAGE MODE)
    )`;

    const primaryOrder = (sort: SearchSort, order: SortOrder) => {
      const d = order === "asc" ? sql.raw("ASC") : sql.raw("DESC");
      switch (sort) {
        case "relevance":
          return sql`relevance ${d}`;
        case "name":
          return sql`name ${d}`;
        case "created_at":
          return sql`created_at ${d}`;
        case "play_count":
          return sql`total_play_count ${d}`;
      }
    };

    const { q, type, sort, order, include_deleted, limit, offset, user_id, playlist_id } = query;
    const hasQ = q !== undefined;

    const deletedGuard = (col: RawBuilder<unknown>) => (include_deleted ? sql`` : sql` AND ${col} IS NULL`);

    const branches: RawBuilder<unknown>[] = [];

    if (type === "all" || type === "tracks") {
      branches.push(sql`
        SELECT
          'track' AS entity_type,
          0 AS type_rank,
          t.id AS id,
          t.name AS name,
          t.created_at AS created_at,
          t.deleted_at AS deleted_at,
          t.user_id AS owner_id,
          u.discord_username AS owner_display_name,
          t.duration AS duration,
          COALESCE(tpc.total_play_count, 0) AS total_play_count,
          COALESCE(tpc.raw_total_play_count, 0) AS raw_total_play_count,
          NULL AS track_count,
          ${hasQ ? scoreExpr(q, sql`t.name`) : sql`NULL`} AS relevance
        FROM tracks AS t
        LEFT JOIN users AS u ON u.id = t.user_id
        LEFT JOIN track_play_counts AS tpc ON tpc.track_id = t.id
        WHERE 1=1
          ${deletedGuard(sql`t.deleted_at`)}
          ${user_id !== undefined ? sql` AND t.user_id = ${user_id}` : sql``}
          ${
            playlist_id !== undefined
              ? sql` AND EXISTS (SELECT 1 FROM playlist_tracks pt WHERE pt.playlist_id = ${playlist_id} AND pt.track_id = t.id)`
              : sql``
          }
          ${hasQ ? sql` AND ${matchFilter(q, sql`t.name`)}` : sql``}
      `);
    }

    if (type === "all" || type === "playlists") {
      branches.push(sql`
        SELECT
          'playlist' AS entity_type,
          1 AS type_rank,
          p.id AS id,
          p.name AS name,
          p.created_at AS created_at,
          p.deleted_at AS deleted_at,
          p.user_id AS owner_id,
          u.discord_username AS owner_display_name,
          NULL AS duration,
          NULL AS total_play_count,
          NULL AS raw_total_play_count,
          (SELECT COUNT(*) FROM playlist_tracks pt WHERE pt.playlist_id = p.id) AS track_count,
          ${hasQ ? scoreExpr(q, sql`p.name`) : sql`NULL`} AS relevance
        FROM playlists AS p
        LEFT JOIN users AS u ON u.id = p.user_id
        WHERE 1=1
          ${deletedGuard(sql`p.deleted_at`)}
          ${user_id !== undefined ? sql` AND p.user_id = ${user_id}` : sql``}
          ${hasQ ? sql` AND ${matchFilter(q, sql`p.name`)}` : sql``}
      `);
    }

    if (type === "all" || type === "users") {
      branches.push(sql`
        SELECT
          'user' AS entity_type,
          2 AS type_rank,
          u.id AS id,
          u.discord_username AS name,
          u.created_at AS created_at,
          NULL AS deleted_at,
          NULL AS owner_id,
          NULL AS owner_display_name,
          NULL AS duration,
          NULL AS total_play_count,
          NULL AS raw_total_play_count,
          NULL AS track_count,
          ${hasQ ? scoreExpr(q, sql`u.discord_username`) : sql`NULL`} AS relevance
        FROM users AS u
        WHERE 1=1
          ${hasQ ? sql` AND ${matchFilter(q, sql`u.discord_username`)}` : sql``}
      `);
    }

    const unionBody = sql.join(branches, sql` UNION ALL `);
    const orderBy = sql.join([primaryOrder(sort, order), sql`type_rank ASC`, sql`id ASC`], sql`, `);

    const result = await sql<Row>`
      SELECT m.*, COUNT(*) OVER () AS total_rows
      FROM (${unionBody}) AS m
      ORDER BY ${orderBy}
      LIMIT ${limit} OFFSET ${offset}
    `.execute(db);

    const rows = result.rows;
    const total = rows.length ? Number(rows[0].total_rows) : 0;
    const relOf = (v: number | null) => (v === null ? null : Number(v));

    const data: UnifiedSearchItem[] = rows.map((r) => {
      if (r.entity_type === "track") {
        return {
          type: "track",
          id: r.id,
          name: r.name ?? "",
          created_at: r.created_at,
          deleted_at: r.deleted_at,
          relevance: relOf(r.relevance),
          duration: Number(r.duration),
          total_play_count: Number(r.total_play_count),
          raw_total_play_count: Number(r.raw_total_play_count),
          user: { id: r.owner_id ?? 0, display_name: r.owner_display_name },
        };
      }
      if (r.entity_type === "playlist") {
        return {
          type: "playlist",
          id: r.id,
          name: r.name ?? "",
          created_at: r.created_at,
          deleted_at: r.deleted_at,
          relevance: relOf(r.relevance),
          track_count: Number(r.track_count),
          user: { id: r.owner_id ?? 0, display_name: r.owner_display_name },
        };
      }
      return {
        type: "user",
        id: r.id,
        name: r.name,
        created_at: r.created_at,
        deleted_at: null,
        relevance: relOf(r.relevance),
      };
    });

    return {
      data,
      pagination: {
        total,
        limit,
        offset,
        has_next: offset + limit < total,
        has_prev: offset > 0,
      },
    };
  }

  // only supports tracks
  async function searchV2(query: UnifiedSearchQuery): Promise<UnifiedSearchResponse> {
    const { q, type, sort, order, include_deleted, limit, offset, user_id, playlist_id } = query;

    const primaryOrder = (sort: SearchSort, order: SortOrder) => {
      const d = order === "asc" ? sql.raw("ASC") : sql.raw("DESC");
      switch (sort) {
        case "relevance":
          return sql`relevance ${d}`;
        case "name":
          return sql`name ${d}`;
        case "created_at":
          return sql`created_at ${d}`;
        case "play_count":
          return sql`total_play_count ${d}`;
      }
    };

    const scoreExpression = (q: string | undefined, name: string) => {
      if (!q) return sql<number>`0`;
      const col = sql.ref(name);
      return sql<number>`(
      (${col} = ${q}) * 14
      + (${col} LIKE CONCAT(${q}, '%')) * 12
      + (${col} LIKE CONCAT('%', ${q}, '%')) * 10
      + MATCH(${col}) AGAINST (${q} IN NATURAL LANGUAGE MODE)
    )`;
    };

    const baseQuery = db
      .selectFrom("tracks as t")
      .leftJoin("track_play_counts as tpc", "t.id", "tpc.track_id")
      .$if(!include_deleted, (qb) => qb.where("t.deleted_at", "is", null))
      .$if(q !== undefined, (qb) =>
        qb.where((eb) =>
          eb.or([
            sql<boolean>`t.name LIKE CONCAT('%', ${q}, '%')`,
            sql<boolean>`MATCH(t.name) AGAINST (${q} IN NATURAL LANGUAGE MODE)`,
          ]),
        ),
      )
      .$if(playlist_id !== undefined, (qb) =>
        qb
          .innerJoin("playlist_tracks", "t.id", "playlist_tracks.track_id")
          .where("playlist_tracks.playlist_id", "=", playlist_id as number),
      )
      .$if(user_id !== undefined, (qb) => qb.where("t.user_id", "=", user_id as number));

    const countResultPromise = baseQuery
      .select(({ fn }) => [fn.countAll<number>().as("total")])
      .executeTakeFirstOrThrow();

    const tracksDataPromise = baseQuery
      .select(({ fn }) => [
        sql<string>`'track'`.as("entity_type"),
        sql<number>`0`.as("type_rank"),
        "t.id",
        "t.name",
        "t.duration",
        "t.user_id",
        "t.deleted_at",
        "t.created_at",
        "t.updated_at",
        fn.coalesce("tpc.total_play_count", sql<number>`0`).as("total_play_count"),
        fn.coalesce("tpc.raw_total_play_count", sql<number>`0`).as("raw_total_play_count"),
        scoreExpression(q, "t.name").as("relevance"),
      ])
      .orderBy(primaryOrder(sort, order))
      .orderBy("type_rank", "asc")
      .orderBy("relevance", "desc")
      .orderBy("name", "asc")
      .limit(limit)
      .offset(offset)
      .execute();

    const [countResult, tracksData] = await Promise.all([countResultPromise, tracksDataPromise]);

    const total = Number(countResult.total);

    const data: UnifiedSearchItem[] = tracksData.map((r) => {
      return {
        type: "track",
        id: r.id,
        name: r.name ?? "",
        created_at: r.created_at,
        deleted_at: r.deleted_at,
        relevance: r.relevance,
        duration: r.duration,
        total_play_count: r.total_play_count,
        raw_total_play_count: r.raw_total_play_count,
        user: { id: r.user_id, display_name: "user_name" },
      };
    });

    return {
      data: data,
      pagination: {
        total: total,
        limit: limit,
        offset: offset,
        has_next: offset + limit < total,
        has_prev: offset > 0,
      },
    };
  }

  // supports searching over all
  async function searchV3(query: UnifiedSearchQuery): Promise<UnifiedSearchResponse> {
    const { q, type, sort, order, include_deleted, limit, offset, user_id, playlist_id } = query;

    const primaryOrder = (sort: SearchSort, order: SortOrder) => {
      const d = order === "asc" ? sql.raw("ASC") : sql.raw("DESC");
      switch (sort) {
        case "relevance":
          return sql`relevance ${d}`;
        case "name":
          return sql`name ${d}`;
        case "created_at":
          return sql`created_at ${d}`;
        case "play_count":
          return sql`total_play_count ${d}`;
      }
    };

    const scoreExpressionV1 = (q: string | undefined, name: string) => {
      if (!q) return sql<number>`0`;
      const col = sql.ref(name);
      return sql<number>`(
        (${col} = ${q}) * 14
        + (${col} LIKE CONCAT(${q}, '%')) * 12
        + (${col} LIKE CONCAT('%', ${q}, '%')) * 10
        + MATCH(${col}) AGAINST (${q} IN NATURAL LANGUAGE MODE)
      )`;
    };

    const scoreExpressionV2 = (q: string | undefined, name: string) => {
      if (!q) return sql<number>`0`;
      const col = sql.ref(name);
      return sql<number>`(
        (MATCH(${col}) AGAINST (${q} IN NATURAL LANGUAGE MODE)) * (
        1
        + (${col} = ${q}) * 1
        + (${col} LIKE CONCAT(${q}, '%')) * 1
        + (${col} LIKE CONCAT('%', ${q}, '%')) * 1
        )
      )`;
    };

    const scoreExpression = scoreExpressionV2;

    const matchFilter = (q: string, name: string) => {
      const col = sql.ref(name);
      return sql<boolean>`(
      ${col} LIKE CONCAT('%', ${q}, '%')
      OR MATCH(${col}) AGAINST (${q} IN NATURAL LANGUAGE MODE)
    )`;
    };

    const trackBranch = db
      .selectFrom("tracks as t")
      .leftJoin("users as u", "u.id", "t.user_id")
      .leftJoin("track_play_counts as tpc", "t.id", "tpc.track_id")
      .select(({ fn }) => [
        sql<string>`'track'`.as("entity_type"),
        sql<number>`0`.as("type_rank"),
        "t.id as id",
        "t.name as name",
        "t.created_at as created_at",
        "t.deleted_at as deleted_at",
        "t.user_id as owner_id",
        "u.discord_username as owner_display_name",
        "t.duration as duration",
        fn.coalesce("tpc.total_play_count", sql<number>`0`).as("total_play_count"),
        fn.coalesce("tpc.raw_total_play_count", sql<number>`0`).as("raw_total_play_count"),
        sql<number>`0`.as("track_count"),
        scoreExpression(q, "t.name").as("relevance"),
      ])
      .$if(!include_deleted, (qb) => qb.where("t.deleted_at", "is", null))
      .$if(q !== undefined, (qb) => qb.where(matchFilter(q as string, "t.name")))
      .$if(playlist_id !== undefined, (qb) =>
        qb
          .innerJoin("playlist_tracks as pt", "t.id", "pt.track_id")
          .where("pt.playlist_id", "=", playlist_id as number),
      )
      .$if(user_id !== undefined, (qb) => qb.where("t.user_id", "=", user_id as number));

    const playlistBranch = db
      .selectFrom("playlists as p")
      .leftJoin("users as u", "u.id", "p.user_id")
      .select([
        sql<string>`'playlist'`.as("entity_type"),
        sql<number>`1`.as("type_rank"),
        "p.id as id",
        "p.name as name",
        "p.created_at as created_at",
        "p.deleted_at as deleted_at",
        "p.user_id as owner_id",
        "u.discord_username as owner_display_name",
        sql<number>`0`.as("duration"),
        sql<number>`0`.as("total_play_count"),
        sql<number>`0`.as("raw_total_play_count"),
        sql<number>`(select count(*) from playlist_tracks pt where pt.playlist_id = p.id)`.as("track_count"),
        scoreExpression(q, "p.name").as("relevance"),
      ])
      .$if(!include_deleted, (qb) => qb.where("p.deleted_at", "is", null))
      .$if(q !== undefined, (qb) => qb.where(matchFilter(q as string, "p.name")))
      .$if(user_id !== undefined, (qb) => qb.where("p.user_id", "=", user_id as number));

    const userBranch = db
      .selectFrom("users as u")
      .select([
        sql<string>`'user'`.as("entity_type"),
        sql<number>`2`.as("type_rank"),
        "u.id as id",
        sql<string>`u.discord_username`.as("name"),
        "u.created_at as created_at",
        sql<Date>`0`.as("deleted_at"),
        sql<number>`0`.as("owner_id"),
        sql<string>`''`.as("owner_display_name"),
        sql<number>`0`.as("duration"),
        sql<number>`0`.as("total_play_count"),
        sql<number>`0`.as("raw_total_play_count"),
        sql<number>`0`.as("track_count"),
        scoreExpression(q, "u.discord_username").as("relevance"),
      ])
      .$if(q !== undefined, (qb) => qb.where(matchFilter(q as string, "u.discord_username")));

    let unionQuery: typeof trackBranch | typeof playlistBranch | typeof userBranch;

    if (type === "tracks") {
      unionQuery = trackBranch;
    } else if (type === "playlists") {
      unionQuery = playlistBranch;
    } else if (type === "users") {
      unionQuery = userBranch;
    } else {
      unionQuery = trackBranch.unionAll(playlistBranch).unionAll(userBranch);
    }

    const base = db.selectFrom(unionQuery.as("m"));

    const countResultPromise = base.select(({ fn }) => [fn.countAll<number>().as("total")]).executeTakeFirstOrThrow();

    const rowsPromise = base
      .selectAll()
      .orderBy(primaryOrder(sort, order))
      .orderBy("type_rank", "asc")
      .orderBy("relevance", "desc")
      .orderBy("name", "asc")
      .limit(limit)
      .offset(offset)
      .execute();

    const [countResult, rows] = await Promise.all([countResultPromise, rowsPromise]);
    const total = Number(countResult.total);

    const relOf = (v: number) => {
      if (q === undefined) return null;
      return Number(v);
    };

    const data: UnifiedSearchItem[] = rows.map((r) => {
      if (r.entity_type === "track") {
        return {
          type: "track",
          id: r.id,
          name: r.name ?? "",
          created_at: r.created_at,
          deleted_at: r.deleted_at,
          relevance: relOf(r.relevance),
          duration: Number(r.duration ?? 0),
          total_play_count: Number(r.total_play_count ?? 0),
          raw_total_play_count: Number(r.raw_total_play_count ?? 0),
          user: {
            id: r.owner_id ?? 0,
            display_name: r.owner_display_name,
          },
        };
      }

      if (r.entity_type === "playlist") {
        return {
          type: "playlist",
          id: r.id,
          name: r.name ?? "",
          created_at: r.created_at,
          deleted_at: r.deleted_at,
          relevance: relOf(r.relevance),
          track_count: Number(r.track_count ?? 0),
          user: {
            id: r.owner_id ?? 0,
            display_name: r.owner_display_name,
          },
        };
      }

      return {
        type: "user",
        id: r.id,
        name: r.name,
        created_at: r.created_at,
        deleted_at: null,
        relevance: relOf(r.relevance),
      };
    });

    return {
      data,
      pagination: {
        total,
        limit,
        offset,
        has_next: offset + limit < total,
        has_prev: offset > 0,
      },
    };
  }

  return { search: searchV3 };
}

export type SearchService = ReturnType<typeof searchServiceFactory>;

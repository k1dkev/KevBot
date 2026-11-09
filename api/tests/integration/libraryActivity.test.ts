import request from "supertest";
import { randomUUID } from "crypto";
import { Express } from "express";
import { Bucket } from "@google-cloud/storage";
import { appFactory } from "../../src/app";
import { configFactory } from "../../src/config/config";
import { dbFactory, KevbotDb } from "../../src/db/connection";
import { seedUsers } from "../seeds/seedUsers";
import { seedTracks } from "../seeds/seedTracks";
import { seedPlaylists } from "../seeds/seedPlaylists";
import { getLoginTokenAndTestResult } from "../utils";

let app: Express;
let db: KevbotDb;
let actor: string;
let otherActor: string;
let browser: string;
let service: string;
let eligibleId: number;
const list = (source: string, query = "") =>
  request(app).get(`/v1/library/pools?source=${source}${query}`).auth(actor, { type: "bearer" });
const listPlaylist = (playlistId: number, query = "") => list("playlist", `&playlist_id=${playlistId}${query}`);
const random = (source: string, query = "") =>
  request(app).get(`/v1/library/pools/random?source=${source}${query}`).auth(actor, { type: "bearer" });
const randomPlaylist = (playlistId: number, query = "") => random("playlist", `&playlist_id=${playlistId}${query}`);
const report = (body: object, token: string | null = actor) => {
  const playbackReport = request(app).post("/v1/plays/events");
  if (token) playbackReport.auth(token, { type: "bearer" });
  return playbackReport.send(body);
};

beforeAll(async () => {
  Object.assign(process.env, {
    GCP_TRACKS_BUCKET_NAME: "dummy",
    KEVBOT_API_ADDRESS: "0.0.0.0",
    KEVBOT_API_JWT_SECRET: "jwt_secret",
    KEVBOT_API_PORT: "3000",
    GCP_API_ENDPOINT: "dummy",
    DEV_ROUTES_ALLOWED: "true",
    DEV_AUTH_SECRET: "TEST_DEV_AUTH_SECRET",
    DISCORD_OAUTH2_REDIRECT_URI: "http://dummy.com",
    DISCORD_OAUTH2_CLIENT_ID: "dummy",
    DISCORD_OAUTH2_CLIENT_SECRET: "dummy",
  });
  const { config, secrets } = configFactory();
  db = dbFactory(secrets.DB_CONNECTION_STRING);
  app = appFactory(config, secrets, db, {} as Bucket);
  await seedUsers(db);
  await seedTracks(db);
  await seedPlaylists(db);
  service = (await request(app).post("/v1/bot/auth").set("x-bot-key", secrets.BOT_AUTH_API_KEY).expect(200)).body
    .access_token;
  const resolve = async (discord_id: string) =>
    (
      await request(app)
        .post("/v1/bot/actors/resolve")
        .auth(service, { type: "bearer" })
        .send({ discord_id })
        .expect(200)
    ).body.access_token;
  actor = await resolve("123711472041781240");
  otherActor = await resolve("135319472041781248");
  browser = await getLoginTokenAndTestResult({ user_id: 1 }, app);
  await db
    .insertInto("tracks")
    .values(
      Array.from({ length: 130 }, (_, i) => ({
        name: `clip${String(i).padStart(3, "0")}`,
        duration: 5,
        user_id: 1,
        created_at: new Date("2026-01-01T00:00:00Z"),
      })),
    )
    .execute();
  const added = await db
    .insertInto("tracks")
    .values({ name: "zzeligible", duration: 1, user_id: 1 })
    .executeTakeFirstOrThrow();
  eligibleId = Number(added.insertId);
  await db
    .insertInto("track_play_type_counts")
    .values([
      { track_id: 23, play_type: 0, play_count: 3 },
      { track_id: 40, play_type: 0, play_count: 3 },
      { track_id: eligibleId, play_type: 1, play_count: 999 },
    ])
    .execute();
  await db
    .insertInto("track_plays")
    .values([
      { track_id: 23, play_type: 0, user_id: 1337, played_at: new Date("2026-01-01T00:00:00Z") },
      { track_id: 23, play_type: 1, user_id: 1, played_at: new Date("2026-01-01T00:00:01Z") },
      { track_id: 50, play_type: 0, user_id: 1, played_at: new Date("2026-01-01T00:00:02Z") },
    ])
    .execute();
});
afterAll(async () => {
  await db.destroy();
});

describe("complete library pools", () => {
  it("paginates beyond 100 without losing total on an empty page", async () => {
    const first = await list("all_tracks", "&limit=100").expect(200);
    const next = await list("all_tracks", "&limit=100&offset=100").expect(200);
    expect(first.body.data).toHaveLength(100);
    expect(first.body.pagination.hasNext).toBe(true);
    expect(next.body.pagination.hasNext).toBe(false);
    const ids = [...first.body.data, ...next.body.data].map((t) => t.id);
    expect(ids).toContain(eligibleId);
    expect(new Set(ids).size).toBe(first.body.pagination.total);
    const empty = await list("all_tracks", "&offset=9999").expect(200);
    expect(empty.body.data).toEqual([]);
    expect(empty.body.pagination.total).toBe(first.body.pagination.total);
  });
  it("uses ordinary PLAY counts only, excluding zeros and stable name/ID ties", async () => {
    const result = await list("most_played").expect(200);
    expect(result.body.data.map((t: { id: number }) => t.id)).toEqual([23, 40]);
    expect(result.body.data.every((t: { ordinary_play_count: number }) => t.ordinary_play_count === 3)).toBe(true);
  });
  it("preserves global repeated history events, timestamps and unavailable explanations", async () => {
    const result = await list("play_history").expect(200);
    expect(result.body.kind).toBe("play_events");
    expect(result.body.data.map((e: { track_id: number }) => e.track_id)).toEqual([50, 23, 23]);
    expect(result.body.data[0]).toMatchObject({ playable: false, unavailable_reason: "deleted_track" });
    expect(result.body.data[1].played_at).toBe("2026-01-01T00:00:01.000Z");
    expect(result.body.data[1].event_id).not.toBe(result.body.data[2].event_id);
    const uploads = await list("upload_history").expect(200);
    expect(uploads.body.pagination.limit).toBe(25);
    expect(uploads.body.data).toHaveLength(25);
    expect(uploads.body.data[0].id).toBe(eligibleId);
  });
  it("requires a resolved user for myuploads and returns only that user's full paged library", async () => {
    await request(app).get("/v1/library/pools?source=my_uploads").expect(401);
    const result = await list("my_uploads", "&limit=100&offset=100").expect(200);
    expect(result.body.data.length).toBeGreaterThan(0);
    expect(result.body.data.every((t: { user_id: number }) => t.user_id === 1)).toBe(true);
    expect(result.body.pagination.total).toBeGreaterThan(100);
  });
  it.each(["0", "-1", "101", "1.5", "abc"])("rejects invalid pool limit %s", async (limit) => {
    await list("most_played", `&limit=${limit}`).expect(400);
    await random("all_tracks", `&limit=${limit}`).expect(400);
  });
  it("samples the complete eligible all/myuploads/playlist pool, not the first page", async () => {
    for (const source of ["all_tracks", "my_uploads"]) {
      const result = await random(source, "&max_duration=2").expect(200);
      expect(result.body.track_id).toBe(eligibleId);
      expect(result.body.source).toEqual({ type: source });
    }
    await db.insertInto("playlist_tracks").values({ playlist_id: 55, track_id: eligibleId, user_id: 1 }).execute();
    const playlist = await randomPlaylist(55, "&max_duration=2").expect(200);
    expect(playlist.body).toEqual({ track_id: eligibleId, source: { type: "playlist", playlist_id: 55 } });
    await randomPlaylist(55, "&max_duration=1").expect(404);
  });
  it("applies the requested ranked/history length before sampling and retains event identities", async () => {
    const ranked = await random("most_played", "&limit=1").expect(200);
    expect(ranked.body.track_id).toBe(23);
    await random("play_history", "&limit=1").expect(404); // newest entry is deleted
    const history = await random("play_history", "&limit=3").expect(200);
    expect(history.body.track_id).toBe(23);
    expect(history.body.history_event_id).toBeDefined();
    expect(history.body.source).toEqual({ type: "play_history" });
  });
  it("uses playlist IDs rather than names, so playlist names never collide with pool types", async () => {
    const all = await db.insertInto("playlists").values({ name: "all", user_id: 1 }).executeTakeFirstOrThrow();
    const allcats = await db.insertInto("playlists").values({ name: "allcats", user_id: 1 }).executeTakeFirstOrThrow();
    const allId = Number(all.insertId);
    const allcatsId = Number(allcats.insertId);
    await db
      .insertInto("playlist_tracks")
      .values([
        { playlist_id: allId, track_id: eligibleId, user_id: 1 },
        { playlist_id: allcatsId, track_id: eligibleId, user_id: 1 },
      ])
      .execute();
    expect((await listPlaylist(allcatsId)).body.data.map((t: { id: number }) => t.id)).toContain(eligibleId);
    expect((await randomPlaylist(allId, "&max_duration=2").expect(200)).body.source).toEqual({
      type: "playlist",
      playlist_id: allId,
    });
    await list("playlist").expect(400);
    await list("all_tracks", `&playlist_id=${allId}`).expect(400);
  });
});

describe("idempotent playback reporting", () => {
  it("records once atomically under concurrent retries, including real playlist selection", async () => {
    const body = {
      event_id: randomUUID(),
      track_id: 23,
      play_type: "random",
      source: { type: "playlist", playlist_id: 55 },
      playback_started: true,
    };
    const before = await db.selectFrom("track_plays").selectAll().where("track_id", "=", 23).execute();
    const responses = await Promise.all(Array.from({ length: 5 }, () => report(body)));
    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 200)).toHaveLength(4);
    const events = await db.selectFrom("track_plays").selectAll().where("track_id", "=", 23).execute();
    expect(events).toHaveLength(before.length + 1);
    expect(await db.selectFrom("playlist_plays").selectAll().where("playlist_id", "=", 55).execute()).toHaveLength(1);
    expect(
      (await db.selectFrom("track_play_counts").selectAll().where("track_id", "=", 23).executeTakeFirstOrThrow())
        .raw_total_play_count,
    ).toBe(1);
    await report({ ...body, source: { type: "all_tracks" } }).expect(409);
    await report(body, otherActor).expect(409);
  });
  it("rejects invalid starts and bot-service-only credentials while accepting browser sessions", async () => {
    const body = { event_id: randomUUID(), track_id: 23, play_type: "play", playback_started: true };
    const count = async () =>
      Number(
        (
          await db
            .selectFrom("playback_events")
            .select((eb) => eb.fn.countAll<number>().as("n"))
            .executeTakeFirstOrThrow()
        ).n,
      );
    const before = await count();
    await report({ ...body, playback_started: false }).expect(400);
    await report(body, service).expect(403);
    await report({ ...body, track_id: 999999 }).expect(404);
    await report({ ...body, track_id: 50 }).expect(404);
    await report({ ...body, play_type: "random", source: { type: "playlist", playlist_id: 999999 } }).expect(404);
    await report({ ...body, source: { type: "playlist", playlist_id: 55 } }).expect(400);
    await report({ ...body, play_type: "playlist_greeting" }).expect(400);
    await report({ ...body, play_type: "random", source: { type: "playlist", playlist_id: 56 } }).expect(400);
    await report({ ...body, play_type: "farewell" }).expect(400);
    await report({ ...body, play_type: "random" }).expect(400);
    await report(body, browser).expect(201);
    expect(await count()).toBe(before + 1);
  });

  it("keeps anonymous events in history without affecting totals or rankings", async () => {
    const body = {
      event_id: randomUUID(),
      track_id: eligibleId,
      play_type: "play",
      playback_started: true,
    };
    const countsBefore = await db
      .selectFrom("track_play_counts")
      .selectAll()
      .where("track_id", "=", eligibleId)
      .executeTakeFirst();
    const typeCountBefore = await db
      .selectFrom("track_play_type_counts")
      .selectAll()
      .where("track_id", "=", eligibleId)
      .where("play_type", "=", 0)
      .executeTakeFirst();

    await report(body, null).expect(201);
    await report(body, null).expect(200);
    const event = await db
      .selectFrom("playback_events")
      .selectAll()
      .where("event_id", "=", body.event_id)
      .executeTakeFirstOrThrow();
    expect(event.user_id).toBeNull();
    expect(
      await db
        .selectFrom("track_plays")
        .selectAll()
        .where("track_id", "=", eligibleId)
        .where("user_id", "is", null)
        .execute(),
    ).toHaveLength(1);
    expect(
      await db.selectFrom("track_play_counts").selectAll().where("track_id", "=", eligibleId).executeTakeFirst(),
    ).toEqual(countsBefore);
    expect(
      await db
        .selectFrom("track_play_type_counts")
        .selectAll()
        .where("track_id", "=", eligibleId)
        .where("play_type", "=", 0)
        .executeTakeFirst(),
    ).toEqual(typeCountBefore);
    expect((await list("play_history")).body.data[0]).toMatchObject({ track_id: eligibleId, actor_id: null });
    expect((await list("most_played")).body.data.map((track: { id: number }) => track.id)).not.toContain(eligibleId);
    await report(body, browser).expect(409);
  });
  it("logs special-pool source identity without fake playlist IDs", async () => {
    const body = {
      event_id: randomUUID(),
      track_id: eligibleId,
      play_type: "random",
      source: { type: "all_tracks" },
      playback_started: true,
    };
    await report(body).expect(201);
    const stored = await db
      .selectFrom("playback_events")
      .selectAll()
      .where("event_id", "=", body.event_id)
      .executeTakeFirstOrThrow();
    expect(stored).toMatchObject({ playlist_id: null, source_type: "all_tracks" });
    await db.updateTable("tracks").set({ deleted_at: new Date() }).where("id", "=", eligibleId).execute();
    await report(body).expect(200); // retry remains idempotent after a later library change
  });
});

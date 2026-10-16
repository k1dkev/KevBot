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
const list = (name: string, query = "") =>
  request(app).get(`/v1/library/pools/${name}${query}`).auth(actor, { type: "bearer" });
const report = (body: object, token = actor) =>
  request(app).post("/v1/plays/events").auth(token, { type: "bearer" }).send(body);

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
    const first = await list("all", "?limit=100").expect(200);
    const next = await list("all", "?limit=100&offset=100").expect(200);
    expect(first.body.data).toHaveLength(100);
    expect(first.body.pagination.hasNext).toBe(true);
    expect(next.body.pagination.hasNext).toBe(false);
    const ids = [...first.body.data, ...next.body.data].map((t) => t.id);
    expect(ids).toContain(eligibleId);
    expect(new Set(ids).size).toBe(first.body.pagination.total);
    const empty = await list("all", "?offset=9999").expect(200);
    expect(empty.body.data).toEqual([]);
    expect(empty.body.pagination.total).toBe(first.body.pagination.total);
  });
  it("uses ordinary PLAY counts only, excluding zeros and stable name/ID ties", async () => {
    const result = await list("mostplayed").expect(200);
    expect(result.body.data.map((t: { id: number }) => t.id)).toEqual([23, 40]);
    expect(result.body.data.every((t: { ordinary_play_count: number }) => t.ordinary_play_count === 3)).toBe(true);
  });
  it("preserves global repeated history events, timestamps and unavailable explanations", async () => {
    const result = await list("playhistory").expect(200);
    expect(result.body.kind).toBe("play_events");
    expect(result.body.data.map((e: { track_id: number }) => e.track_id)).toEqual([50, 23, 23]);
    expect(result.body.data[0]).toMatchObject({ playable: false, unavailable_reason: "deleted_track" });
    expect(result.body.data[1].played_at).toBe("2026-01-01T00:00:01.000Z");
    expect(result.body.data[1].event_id).not.toBe(result.body.data[2].event_id);
    const uploads = await list("uploadhistory").expect(200);
    expect(uploads.body.pagination.limit).toBe(25);
    expect(uploads.body.data).toHaveLength(25);
    expect(uploads.body.data[0].id).toBe(eligibleId);
  });
  it("requires a resolved user for myuploads and returns only that user's full paged library", async () => {
    await request(app).get("/v1/library/pools/myuploads").expect(401);
    const result = await list("myuploads", "?limit=100&offset=100").expect(200);
    expect(result.body.data.length).toBeGreaterThan(0);
    expect(result.body.data.every((t: { user_id: number }) => t.user_id === 1)).toBe(true);
    expect(result.body.pagination.total).toBeGreaterThan(100);
  });
  it.each(["0", "-1", "101", "1.5", "abc"])("rejects invalid pool limit %s", async (limit) => {
    await list("mostplayed", `?limit=${limit}`).expect(400);
    await list("all/random", `?limit=${limit}`).expect(400);
  });
  it("samples the complete eligible all/myuploads/category pool, not the first page", async () => {
    for (const name of ["all", "myuploads"]) {
      const result = await list(`${name}/random`, "?max_duration=2").expect(200);
      expect(result.body.track_id).toBe(eligibleId);
      expect(result.body.playlist_id).toBeUndefined();
    }
    await db.insertInto("playlist_tracks").values({ playlist_id: 55, track_id: eligibleId, user_id: 1 }).execute();
    const category = await list("bestclips/random", "?max_duration=2").expect(200);
    expect(category.body).toEqual({ track_id: eligibleId, playlist_id: 55 });
    await list("bestclips/random", "?max_duration=1").expect(404);
  });
  it("applies the requested ranked/history length before sampling and retains event identities", async () => {
    const ranked = await list("mostplayed/random", "?limit=1").expect(200);
    expect(ranked.body.track_id).toBe(23);
    await list("playhistory/random", "?limit=1").expect(404); // newest entry is deleted
    const history = await list("playhistory/random", "?limit=3").expect(200);
    expect(history.body.track_id).toBe(23);
    expect(history.body.history_event_id).toBeDefined();
    expect(history.body.playlist_id).toBeUndefined();
  });
  it("lists categories/aliases/empty categories but never samples them", async () => {
    const cats = await list("cats").expect(200);
    expect((await list("categories").expect(200)).body).toEqual(cats.body);
    const empty = await list("emptycats").expect(200);
    expect(empty.body.data.map((c: { id: number }) => c.id)).toEqual([56]);
    for (const name of ["cats", "categories", "emptycats"]) await list(`${name}/random`).expect(400);
    await list("missingcategory").expect(404);
  });
});

describe("idempotent playback reporting", () => {
  it("records once atomically under concurrent retries, including real playlist selection", async () => {
    const body = { event_id: randomUUID(), track_id: 23, play_type: 1, playlist_id: 55, playback_started: true };
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
    await report({ ...body, play_type: 0 }).expect(409);
    await report(body, otherActor).expect(409);
  });
  it("does not log failed starts, invalid/deleted tracks, invalid playlists or non-bot clients", async () => {
    const body = { event_id: randomUUID(), track_id: 23, play_type: 0, playback_started: true };
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
    await report(body, browser).expect(403);
    await report(body, service).expect(403);
    await report({ ...body, track_id: 999999 }).expect(404);
    await report({ ...body, track_id: 50 }).expect(404);
    await report({ ...body, play_type: 1, playlist_id: 999999 }).expect(404);
    await report({ ...body, playlist_id: 55 }).expect(400);
    await report({ ...body, play_type: 5 }).expect(400);
    await report({ ...body, play_type: 1, playlist_id: 56 }).expect(400);
    await report({ ...body, play_type: 4 }).expect(400);
    expect(await count()).toBe(before);
  });
  it("logs ordinary virtual-pool starts without fake playlist IDs", async () => {
    const body = { event_id: randomUUID(), track_id: eligibleId, play_type: 0, playback_started: true };
    await report(body).expect(201);
    const stored = await db
      .selectFrom("playback_events")
      .selectAll()
      .where("event_id", "=", body.event_id)
      .executeTakeFirstOrThrow();
    expect(stored.playlist_id).toBeNull();
    await db.updateTable("tracks").set({ deleted_at: new Date() }).where("id", "=", eligibleId).execute();
    await report(body).expect(200); // retry remains idempotent after a later library change
  });
});

import request from "supertest";
import { randomUUID } from "crypto";
import { appFactory } from "../../src/app";
import { seedUsers } from "../seeds/seedUsers";
import { seedTracks } from "../seeds/seedTracks";
import { seedPlaylists } from "../seeds/seedPlaylists";
import { Kysely } from "kysely";
import { Database } from "../../src/db/schema";
import { dbFactory } from "../../src/db/connection";
import { Express } from "express";
import { configFactory } from "../../src/config/config";
import { Bucket } from "@google-cloud/storage";
import { getLoginTokenAndTestResult } from "../utils";
import { user_login } from "../seeds/seedUsers";
import { aggregatePlayCounts } from "../../src/tasks/aggregatePlayCounts";

let db: Kysely<Database>;
let app: Express;

beforeAll(async () => {
  process.env.GCP_TRACKS_BUCKET_NAME = "dummy";
  process.env.KEVBOT_API_ADDRESS = "0.0.0.0";
  process.env.KEVBOT_API_JWT_SECRET = "jwt_secret";
  process.env.KEVBOT_API_PORT = "3000";
  process.env.GCP_API_ENDPOINT = "dummy";
  process.env.DEV_ROUTES_ALLOWED = "true";
  process.env.DEV_AUTH_SECRET = "TEST_DEV_AUTH_SECRET";
  process.env.DISCORD_OAUTH2_REDIRECT_URI = "http://dummy.com";
  process.env.DISCORD_OAUTH2_CLIENT_ID = "dummy";
  process.env.DISCORD_OAUTH2_CLIENT_SECRET = "dummy";
  const { config, secrets } = configFactory();
  const dummyTracksBucket = {} as Bucket;
  db = dbFactory(secrets.DB_CONNECTION_STRING);
  app = appFactory(config, secrets, db, dummyTracksBucket);
  await seedUsers(db);
  await seedTracks(db);
  await seedPlaylists(db);
});

afterAll(async () => {
  await db.destroy();
});

describe("POST /v1/plays/events", () => {
  it("records anonymous plays in history without changing aggregate totals", async () => {
    const added = await db
      .insertInto("tracks")
      .values({ name: "anonymousonly", duration: 3, user_id: 1 })
      .executeTakeFirstOrThrow();
    const trackId = Number(added.insertId);
    await db.insertInto("track_play_type_counts").values({ track_id: trackId, play_type: 0, play_count: 1 }).execute();
    await db
      .insertInto("track_play_counts")
      .values({ track_id: trackId, raw_total_play_count: 1, total_play_count: 1 })
      .execute();

    const body = {
      event_id: randomUUID(),
      track_id: trackId,
      play_type: "play",
      playback_started: true,
    };
    await request(app).post("/v1/plays/events").send(body).expect(201);

    const event = await db
      .selectFrom("playback_events")
      .selectAll()
      .where("event_id", "=", body.event_id)
      .executeTakeFirst();
    const history = await db.selectFrom("track_plays").selectAll().where("track_id", "=", trackId).execute();
    expect(event?.user_id).toBeNull();
    expect(history).toHaveLength(1);
    expect(history[0].user_id).toBeNull();

    await aggregatePlayCounts(db);
    expect(
      await db.selectFrom("track_play_type_counts").selectAll().where("track_id", "=", trackId).execute(),
    ).toHaveLength(0);
    expect(
      await db.selectFrom("track_play_counts").selectAll().where("track_id", "=", trackId).executeTakeFirst(),
    ).toMatchObject({
      raw_total_play_count: 0,
      total_play_count: 0,
    });
  });

  it("attributes browser-session plays and updates totals", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const body = {
      event_id: randomUUID(),
      track_id: 40,
      play_type: "play",
      playback_started: true,
    };
    await request(app).post("/v1/plays/events").auth(jwtToken, { type: "bearer" }).send(body).expect(201);

    const event = await db
      .selectFrom("playback_events")
      .selectAll()
      .where("event_id", "=", body.event_id)
      .executeTakeFirst();
    expect(event?.user_id).toBe(1);
    expect(
      await db.selectFrom("track_plays").selectAll().where("track_id", "=", 40).where("user_id", "=", 1).execute(),
    ).toHaveLength(1);
    expect(
      await db.selectFrom("track_play_counts").selectAll().where("track_id", "=", 40).executeTakeFirst(),
    ).toMatchObject({
      raw_total_play_count: 1,
      total_play_count: 1,
    });
  });

  it("rejects invalid supplied credentials rather than downgrading them to anonymous", async () => {
    await request(app)
      .post("/v1/plays/events")
      .set("Authorization", "Bearer not-a-valid-token")
      .send({ event_id: randomUUID(), track_id: 23, play_type: "play", playback_started: true })
      .expect(401);
  });

  it("replaces the old split play-log routes", async () => {
    await request(app).post("/v1/plays/tracks").send({ track_id: 23, play_type: 0 }).expect(404);
    await request(app).post("/v1/plays/playlists/random").send({ playlist_id: 55 }).expect(404);
  });
});

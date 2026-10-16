import request from "supertest";
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
import { PLAY_TYPE, PlayType } from "../../src/services/playsService";

let db: Kysely<Database>;
let app: Express;

beforeAll(async () => {
  // TODO: improve management of environment variables
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

describe("POST /v1/plays/tracks", () => {
  it("should return 201 and a success message, for every play type", async () => {
    const testLogTrack = async (playType: PlayType, withLogin: boolean) => {
      let resPromise = request(app).post("/v1/plays/tracks").send({ track_id: 23, play_type: playType });
      if (withLogin) {
        const jwtToken = await getLoginTokenAndTestResult(user_login, app);
        resPromise = resPromise.set("Authorization", `Bearer ${jwtToken}`);
      }
      const res = await resPromise.expect(201);
      expect(res.body).toEqual({});
    };
    const typesToTry = [
      PLAY_TYPE.PLAY,
      PLAY_TYPE.PLAY_RANDOM,
      PLAY_TYPE.GREETING,
      PLAY_TYPE.RAID,
      PLAY_TYPE.FAREWELL,
      PLAY_TYPE.PLAYLIST_GREETING,
    ];
    for (const playType of typesToTry) {
      await testLogTrack(playType, false);
      await testLogTrack(playType, true);
    }
  }, 10000);

  it("should update play count of track", async () => {
    const res = await request(app).get("/v1/tracks/23").expect(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        id: 23,
        raw_total_play_count: 12,
        total_play_count: 6,
      }),
    );
  });

  it("returns error if invalid track_id format is given", async () => {
    const res = await request(app)
      .post("/v1/plays/tracks")
      .send({ track_id: "not_an_int", play_type: PLAY_TYPE.PLAY })
      .expect(400);
    expect(res.body).toEqual({ statusCode: 400, error: "Bad Request", message: expect.any(String) });
    expect(res.body?.message).toMatch(/validation error.*track_id/i);
  });

  it("returns error if invalid play_type format is given", async () => {
    const res = await request(app)
      .post("/v1/plays/tracks")
      .send({ track_id: 23, play_type: "not a number" })
      .expect(400);
    expect(res.body).toEqual({ statusCode: 400, error: "Bad Request", message: expect.any(String) });
    expect(res.body?.message).toMatch(/validation error.*play_type/i);
  });

  it("returns error if non-existent play_type is given", async () => {
    const res = await request(app).post("/v1/plays/tracks").send({ track_id: 23, play_type: 404 }).expect(400);
    expect(res.body).toEqual({ statusCode: 400, error: "Bad Request", message: expect.any(String) });
    expect(res.body?.message).toMatch(/validation error.*play_type/i);
  });

  it("returns error if track_id not found", async () => {
    const res = await request(app)
      .post("/v1/plays/tracks")
      .send({ track_id: 404, play_type: PLAY_TYPE.PLAY })
      .expect(404);
    expect(res.body).toEqual({ statusCode: 404, error: "Not Found", message: expect.any(String) });
    expect(res.body?.message).toMatch(/Track not found/i);
  });

  it("logs user when a user is provided", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    await request(app)
      .post("/v1/plays/tracks")
      .set("Authorization", `Bearer ${jwtToken}`)
      .send({ track_id: 40, play_type: PLAY_TYPE.PLAY })
      .expect(201);
    const latestPlayLog = await db
      .selectFrom("track_plays")
      .selectAll()
      .where("user_id", "=", 1)
      .where("track_id", "=", 40)
      .orderBy("played_at", "desc")
      .limit(1)
      .executeTakeFirst();
    expect(latestPlayLog).toBeDefined();
    expect(latestPlayLog?.track_id).toEqual(40);
    expect(latestPlayLog?.user_id).toEqual(1);
  });
});

describe("POST /v1/plays/playlists/random", () => {
  it("should return 201 and a success message, when logged in or not", async () => {
    const testLogTrack = async (withLogin: boolean) => {
      let resPromise = request(app).post("/v1/plays/playlists/random").send({ playlist_id: 55 });
      if (withLogin) {
        const jwtToken = await getLoginTokenAndTestResult(user_login, app);
        resPromise = resPromise.set("Authorization", `Bearer ${jwtToken}`);
      }
      const res = await resPromise.expect(201);
      expect(res.body).toEqual({});
    };
    await testLogTrack(false);
    await testLogTrack(true);
  });

  it("should update playlist plays table", async () => {
    const playlistPlays = await db.selectFrom("playlist_plays").selectAll().where("playlist_id", "=", 55).execute();
    expect(playlistPlays).toHaveLength(2);
    const playlistPlaysWithUser = await db
      .selectFrom("playlist_plays")
      .selectAll()
      .where("user_id", "=", 1)
      .where("playlist_id", "=", 55)
      .execute();
    expect(playlistPlaysWithUser).toHaveLength(1);
  });

  it("returns error if invalid playlist_id format is given", async () => {
    const res = await request(app).post("/v1/plays/playlists/random").send({ playlist_id: "not_an_int" }).expect(400);
    expect(res.body).toEqual({ statusCode: 400, error: "Bad Request", message: expect.any(String) });
    expect(res.body?.message).toMatch(/validation error.*playlist_id/i);
  });

  it("returns error if playlist_id not found", async () => {
    const res = await request(app).post("/v1/plays/playlists/random").send({ playlist_id: 404 }).expect(404);
    expect(res.body).toEqual({ statusCode: 404, error: "Not Found", message: expect.any(String) });
    expect(res.body?.message).toMatch(/Playlist not found/i);
  });
});

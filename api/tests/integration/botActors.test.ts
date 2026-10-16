import request from "supertest";
import jwt from "jsonwebtoken";
import { Express } from "express";
import { Bucket } from "@google-cloud/storage";
import { appFactory } from "../../src/app";
import { configFactory, Config, Secrets } from "../../src/config/config";
import { dbFactory, KevbotDb } from "../../src/db/connection";
import { seedUsers } from "../seeds/seedUsers";
import { seedTracks } from "../seeds/seedTracks";
import { seedPlaylists } from "../seeds/seedPlaylists";
import { getLoginTokenAndTestResult } from "../utils";

let app: Express;
let db: KevbotDb;
let config: Config;
let secrets: Secrets;
let service: string;
let owner: string;
let master: string;
let unrelated: string;
const freshDiscordId = "1234567890123456789";

const resolve = (token: string, body: object) =>
  request(app).post("/v1/bot/actors/resolve").auth(token, { type: "bearer" }).send(body);

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
    MASTER_DISCORD_ID: "135319472041781248",
  });
  ({ config, secrets } = configFactory());
  db = dbFactory(secrets.DB_CONNECTION_STRING);
  app = appFactory(config, secrets, db, {} as Bucket);
  await seedUsers(db);
  await seedTracks(db);
  await seedPlaylists(db);
  service = (await request(app).post("/v1/bot/auth").set("x-bot-key", secrets.BOT_AUTH_API_KEY).expect(200)).body
    .access_token;
  owner = await getLoginTokenAndTestResult({ user_id: 1 }, app);
  master = (await resolve(service, { discord_id: config.masterDiscordId }).expect(200)).body.access_token;
  unrelated = (await resolve(service, { discord_id: freshDiscordId }).expect(200)).body.access_token;
});
afterAll(async () => {
  await db.destroy();
  delete process.env.MASTER_DISCORD_ID;
});

describe("bot actor boundary", () => {
  it("resolves existing users, provisions fresh string snowflakes once under concurrency, without website sessions", async () => {
    const grants = await Promise.all(
      Array.from({ length: 5 }, () => resolve(service, { discord_id: freshDiscordId }).expect(200)),
    );
    expect(new Set(grants.map((r) => r.body.user.id)).size).toBe(1);
    expect(grants[0].body.user.discord_id).toBe(freshDiscordId);
    expect(await db.selectFrom("sessions").selectAll().where("user_id", "=", grants[0].body.user.id).execute()).toEqual(
      [],
    );
    const me = await request(app).get("/v1/auth/me").auth(grants[0].body.access_token, { type: "bearer" }).expect(200);
    expect(me.body.user.discord_id).toBe(freshDiscordId);
    expect(me.body.role).toBe("bot");
  });
  it("does not allow a service token to act as user 0", async () => {
    await request(app)
      .post("/v1/playlists")
      .auth(service, { type: "bearer" })
      .send({ name: "serviceactor" })
      .expect(403);
    expect(await db.selectFrom("users").select("id").where("id", "=", 0).execute()).toEqual([]);
  });
  it("rejects browser/delegated clients, numeric snowflakes, supplied IDs and privilege claims", async () => {
    await resolve(owner, { discord_id: freshDiscordId }).expect(403);
    await resolve(unrelated, { discord_id: config.masterDiscordId }).expect(403);
    for (const body of [
      { discord_id: 1234567890123456789 },
      { discord_id: "0" },
      { discord_id: freshDiscordId, user_id: 1 },
      { discord_id: freshDiscordId, role: "master" },
    ]) {
      await resolve(service, body).expect(400);
    }
  });
  it("rejects forged, expired, mismatched and invalid-subject JWTs", async () => {
    const sign = (payload: object, secret = secrets.KEVBOT_API_JWT_SECRET) =>
      jwt.sign(payload, secret, { audience: config.authJwtAudience, issuer: config.authJwtIssuer });
    for (const token of [
      sign({ role: "bot", sub: "bot", actor_id: 1, actor_discord_id: freshDiscordId }),
      sign({ role: "bot", sub: "bot", actor_id: 0, actor_discord_id: freshDiscordId }),
      sign({ role: "bot", sub: "bot", actor_id: 1, actor_discord_id: "123711472041781240" }, "attacker-secret"),
      sign({ role: "user", sub: "0" }),
      sign({ role: "user", sub: "1.5" }),
      sign({ role: "user", sub: "1", actor_id: 1337 }),
      sign({ role: "bot", sub: "bot", exp: 1 }),
    ])
      await request(app).get("/v1/auth/me").auth(token, { type: "bearer" }).expect(401);
  });
});

describe("shared playlist policy", () => {
  it("allows shared additions, creator/master removals, and only empty deletion", async () => {
    const playlist = (
      await request(app)
        .post("/v1/playlists")
        .auth(owner, { type: "bearer" })
        .send({ name: "collaborative" })
        .expect(201)
    ).body;
    await request(app)
      .post(`/v1/playlists/${playlist.id}/tracks`)
      .auth(unrelated, { type: "bearer" })
      .send({ track_ids: [40] })
      .expect(201);
    await request(app)
      .delete(`/v1/playlists/${playlist.id}/tracks`)
      .auth(unrelated, { type: "bearer" })
      .send({ track_ids: [40] })
      .expect(403);
    for (const actor of [owner, master])
      await request(app).delete(`/v1/playlists/${playlist.id}`).auth(actor, { type: "bearer" }).expect(409);
    await request(app)
      .delete(`/v1/playlists/${playlist.id}/tracks`)
      .auth(master, { type: "bearer" })
      .send({ track_ids: [40] })
      .expect(200);
    await request(app).delete(`/v1/playlists/${playlist.id}`).auth(unrelated, { type: "bearer" }).expect(403);
    await request(app).delete(`/v1/playlists/${playlist.id}`).auth(master, { type: "bearer" }).expect(200);
    await request(app)
      .post(`/v1/playlists/${playlist.id}/tracks`)
      .auth(owner, { type: "bearer" })
      .send({ track_ids: [40] })
      .expect(404);
    await request(app)
      .patch(`/v1/playlists/${playlist.id}/restore`)
      .auth(master, { type: "bearer" })
      .send({})
      .expect(403);
    await request(app)
      .patch(`/v1/playlists/${playlist.id}/restore`)
      .auth(owner, { type: "bearer" })
      .send({})
      .expect(200);
    await request(app)
      .patch(`/v1/playlists/${playlist.id}`)
      .auth(master, { type: "bearer" })
      .send({ name: "notmasterowned" })
      .expect(403);
  });
  it("does not give master blanket profile/track/preference privileges", async () => {
    await request(app)
      .patch("/v1/users/1")
      .auth(master, { type: "bearer" })
      .send({ discord_username: "hijacked" })
      .expect(403);
    await request(app).delete("/v1/tracks/40").auth(master, { type: "bearer" }).expect(403);
    await request(app)
      .put("/v1/users/1/greeting")
      .auth(master, { type: "bearer" })
      .send({ greeting_track_id: 40, greeting_playlist_id: null })
      .expect(403);
    const noMaster = appFactory({ ...config, masterDiscordId: undefined }, secrets, db, {} as Bucket);
    await request(noMaster)
      .delete("/v1/playlists/55/tracks")
      .auth(master, { type: "bearer" })
      .send({ track_ids: [23] })
      .expect(403);
  });
  it("allows ordinary playlist names that overlap former pool words", async () => {
    for (const name of ["all", "allcats", "mostplayed", "playhistory", "uploadhistory"]) {
      await request(app).post("/v1/playlists").auth(owner, { type: "bearer" }).send({ name }).expect(201);
    }
  });
  it("supports 45-character playlist names without widening track names or truncating legacy data", async () => {
    const longName = "a".repeat(45);
    const created = await request(app)
      .post("/v1/playlists")
      .auth(owner, { type: "bearer" })
      .send({ name: longName })
      .expect(201);
    expect(created.body.name).toBe(longName);
    await request(app)
      .post("/v1/playlists")
      .auth(owner, { type: "bearer" })
      .send({ name: longName + "a" })
      .expect(400);
    await request(app)
      .patch("/v1/tracks/40")
      .auth(owner, { type: "bearer" })
      .send({ name: "a".repeat(16) })
      .expect(400);
    await request(app).patch("/v1/tracks/40").auth(owner, { type: "bearer" }).send({ name: "allcats" }).expect(200);
  });
});

describe("preference validation", () => {
  it.each([
    [3, 200],
    [3.999, 200],
    [4, 400],
  ])("enforces strict farewell duration %s for owner and master", async (duration, status) => {
    const { insertId } = await db
      .insertInto("tracks")
      .values({ name: `farewell${String(duration).replace(".", "")}`, duration, user_id: 1 })
      .executeTakeFirstOrThrow();
    for (const token of [owner, master])
      await request(app)
        .put("/v1/users/@me/farewell")
        .auth(token, { type: "bearer" })
        .send({ farewell_track_id: Number(insertId), farewell_playlist_id: null })
        .expect(status);
  });
  it("rejects deleted tracks/playlists and empty greeting playlists", async () => {
    await request(app)
      .put("/v1/users/@me/greeting")
      .auth(owner, { type: "bearer" })
      .send({ greeting_track_id: 50, greeting_playlist_id: null })
      .expect(404);
    await request(app)
      .put("/v1/users/@me/greeting")
      .auth(owner, { type: "bearer" })
      .send({ greeting_track_id: null, greeting_playlist_id: 50 })
      .expect(404);
    await request(app)
      .put("/v1/users/@me/greeting")
      .auth(owner, { type: "bearer" })
      .send({ greeting_track_id: null, greeting_playlist_id: 56 })
      .expect(400);
  });
});

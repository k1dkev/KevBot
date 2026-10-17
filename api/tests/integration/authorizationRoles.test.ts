import request from "supertest";
import { Express } from "express";
import { Bucket } from "@google-cloud/storage";
import { appFactory } from "../../src/app";
import { configFactory } from "../../src/config/config";
import { dbFactory, KevbotDb } from "../../src/db/connection";
import { bootstrapInitialAdmin } from "../../src/tasks/bootstrapInitialAdmin";
import { seedUsers } from "../seeds/seedUsers";
import { seedTracks } from "../seeds/seedTracks";
import { seedPlaylists } from "../seeds/seedPlaylists";
import { getLoginTokenAndTestResult } from "../utils";

let app: Express;
let db: KevbotDb;
let userToken: string;
let moderatorToken: string;
let ordinaryBotActorToken: string;
let ordinaryBotActorId: number;
let serviceToken: string;

const ownerDiscordId = "123711472041781240";
const moderatorDiscordId = "135319472041781248";
const ordinaryDiscordId = "1234567890987654321";

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
  await db.updateTable("users").set({ authorization_role: "moderator" }).where("id", "=", 1337).execute();

  userToken = await getLoginTokenAndTestResult({ user_id: 1 }, app);
  serviceToken = (await request(app).post("/v1/bot/auth").set("x-bot-key", secrets.BOT_AUTH_API_KEY).expect(200)).body
    .access_token;
  moderatorToken = (
    await request(app)
      .post("/v1/bot/actors/resolve")
      .auth(serviceToken, { type: "bearer" })
      .send({ discord_id: moderatorDiscordId })
      .expect(200)
  ).body.access_token;
  const ordinaryActor = (
    await request(app)
      .post("/v1/bot/actors/resolve")
      .auth(serviceToken, { type: "bearer" })
      .send({ discord_id: ordinaryDiscordId })
      .expect(200)
  ).body;
  ordinaryBotActorToken = ordinaryActor.access_token;
  ordinaryBotActorId = ordinaryActor.user.id;
});

afterAll(async () => {
  await db.destroy();
});

describe("fixed authorization roles", () => {
  it("migrates existing accounts to user and applies the same policy to browser and bot actors", async () => {
    const existingUser = await db
      .selectFrom("users")
      .select("authorization_role")
      .where("id", "=", 1)
      .executeTakeFirstOrThrow();
    expect(existingUser.authorization_role).toBe("user");
    await request(app).get("/v1/admin/users").auth(userToken, { type: "bearer" }).expect(403);

    const { insertId } = await db
      .insertInto("tracks")
      .values({ name: "rolecheck", duration: 2, user_id: 1 })
      .executeTakeFirstOrThrow();
    await request(app)
      .patch(`/v1/tracks/${insertId}`)
      .auth(ordinaryBotActorToken, { type: "bearer" })
      .send({ name: "rolecheckdenied" })
      .expect(403);
    await request(app)
      .patch(`/v1/tracks/${insertId}`)
      .auth(moderatorToken, { type: "bearer" })
      .send({ name: "modrenamed" })
      .expect(200);
    await request(app).delete(`/v1/tracks/${insertId}`).auth(moderatorToken, { type: "bearer" }).expect(200);
    await request(app).get("/v1/admin/users").auth(moderatorToken, { type: "bearer" }).expect(403);
  });

  it("bootstraps once, supports admin role assignment, and never trusts a stale JWT role", async () => {
    expect(await bootstrapInitialAdmin(db, ownerDiscordId)).toEqual({ status: "completed", userId: 1 });
    expect(await bootstrapInitialAdmin(db, ownerDiscordId)).toEqual({ status: "already_completed" });

    const users = await request(app).get("/v1/admin/users").auth(userToken, { type: "bearer" }).expect(200);
    expect(users.body.find((user: { id: number }) => user.id === 1).authorization_role).toBe("admin");
    const promoted = await request(app)
      .patch("/v1/admin/users/1337/role")
      .auth(userToken, { type: "bearer" })
      .send({ role: "admin" })
      .expect(200);
    expect(promoted.body.authorization_role).toBe("admin");
    await request(app)
      .patch("/v1/admin/users/1337/role")
      .auth(moderatorToken, { type: "bearer" })
      .send({ role: "user" })
      .expect(403);
    await request(app)
      .patch("/v1/admin/users/1/role")
      .auth(userToken, { type: "bearer" })
      .send({ role: "user" })
      .expect(403);
    await request(app)
      .patch("/v1/admin/users/1337/role")
      .auth(userToken, { type: "bearer" })
      .send({ role: "master" })
      .expect(400);

    // The same delegated token loses its moderation abilities immediately after demotion.
    await request(app)
      .patch("/v1/admin/users/1337/role")
      .auth(userToken, { type: "bearer" })
      .send({ role: "user" })
      .expect(200);
    const track = await db
      .insertInto("tracks")
      .values({ name: "demotioncheck", duration: 2, user_id: 1 })
      .executeTakeFirstOrThrow();
    await request(app)
      .patch(`/v1/tracks/${track.insertId}`)
      .auth(moderatorToken, { type: "bearer" })
      .send({ name: "demotiondenied" })
      .expect(403);
  });

  it("does not silently re-promote a demoted account and serializes concurrent last-admin changes", async () => {
    // User 1337 remains the sole Admin; the one-time bootstrap marker prevents restoration of user 1.
    await request(app)
      .patch("/v1/admin/users/1337/role")
      .auth(userToken, { type: "bearer" })
      .send({ role: "admin" })
      .expect(200);
    await db.updateTable("users").set({ authorization_role: "moderator" }).where("id", "=", 1).execute();
    expect(await bootstrapInitialAdmin(db, ownerDiscordId)).toEqual({ status: "already_completed" });
    expect(
      await db.selectFrom("users").select("authorization_role").where("id", "=", 1).executeTakeFirstOrThrow(),
    ).toMatchObject({ authorization_role: "moderator" });

    // Restore user 1 through the current Admin, then add the ordinary bot actor as a second Admin.
    await request(app)
      .patch("/v1/admin/users/1/role")
      .auth(moderatorToken, { type: "bearer" })
      .send({ role: "admin" })
      .expect(200);
    await request(app)
      .patch("/v1/admin/users/1337/role")
      .auth(userToken, { type: "bearer" })
      .send({ role: "moderator" })
      .expect(200);
    await request(app)
      .patch(`/v1/admin/users/${ordinaryBotActorId}/role`)
      .auth(userToken, { type: "bearer" })
      .send({ role: "admin" })
      .expect(200);

    const outcomes = await Promise.all([
      request(app)
        .patch(`/v1/admin/users/${ordinaryBotActorId}/role`)
        .auth(userToken, { type: "bearer" })
        .send({ role: "user" }),
      request(app)
        .patch("/v1/admin/users/1/role")
        .auth(ordinaryBotActorToken, { type: "bearer" })
        .send({ role: "user" }),
    ]);
    expect(outcomes.map((response) => response.status).sort()).toEqual([200, 403]);
    const admins = await db.selectFrom("users").select("id").where("authorization_role", "=", "admin").execute();
    expect(admins).toHaveLength(1);
  });
});

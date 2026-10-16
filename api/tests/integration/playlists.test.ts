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
import { i32IdCheck, getLoginTokenAndTestResult } from "../utils";
import { user_login } from "../seeds/seedUsers";

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

describe("GET /v1/playlists", () => {
  it("should return 200 and a list of playlists.", async () => {
    const res = await request(app).get("/v1/playlists");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: 55,
        name: "bestclips",
        created_at: "2024-12-13T21:03:00.000Z",
        deleted_at: null,
        user_id: 1,
        updated_at: "2024-12-13T21:03:00.000Z",
      },
      {
        id: 56,
        name: "greatclips",
        created_at: "2024-12-13T21:03:00.000Z",
        deleted_at: null,
        user_id: 1337,
        updated_at: "2024-12-13T21:03:00.000Z",
      },
    ]);
  });

  it("should return 200 and a list of filtered list of playlists based on name.", async () => {
    const res = await request(app).get("/v1/playlists?name=bestclips");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: 55,
        name: "bestclips",
        created_at: "2024-12-13T21:03:00.000Z",
        deleted_at: null,
        user_id: 1,
        updated_at: "2024-12-13T21:03:00.000Z",
      },
    ]);
  });

  it("should return empty list because include deleted is false", async () => {
    const res = await request(app).get("/v1/playlists?name=deletedplaylist");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("should return a filtered list of playlists based on name and include deleted", async () => {
    const res = await request(app).get("/v1/playlists?name=deletedplaylist&include_deleted=true");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: 50,
        name: "deletedplaylist",
        created_at: "2024-12-11T08:21:03.000Z",
        deleted_at: expect.any(String),
        user_id: 1,
        updated_at: expect.any(String),
      },
    ]);
  });

  it("should return 200 and a empty list of playlists because playlist name does not exist.", async () => {
    const res = await request(app).get("/v1/playlists?name=does_not_exist");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns error if invalid query parameter is provided", async () => {
    const res = await request(app).get("/v1/playlists?dne=hello");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ statusCode: 400, error: "Bad Request", message: expect.any(String) });
    expect(res.body?.message).toMatch(/validation error.*dne/i);
  });
});

describe("GET /v1/playlists/:id", () => {
  it("should enforce i32 id", async () => {
    await i32IdCheck(async (id: any) => {
      return request(app).get(`/v1/playlists/${id}`);
    });
  });

  it("should return 200 and the playlist", async () => {
    const res = await request(app).get("/v1/playlists/55");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 55,
      name: "bestclips",
      created_at: "2024-12-13T21:03:00.000Z",
      deleted_at: null,
      user_id: 1,
      updated_at: "2024-12-13T21:03:00.000Z",
    });
  });

  it("returns not found if invalid playlist id is provided", async () => {
    const res = await request(app).get("/v1/playlists/404");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ statusCode: 404, error: "Not Found", message: expect.any(String) });
    expect(res.body?.message).toMatch(/playlist not found/i);
  });
});

describe("POST /v1/playlists/", () => {
  it("should create playlist and return meta data", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app)
      .post("/v1/playlists")
      .set("Authorization", `Bearer ${jwtToken}`)
      .send({ name: "newplaylist" });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: 788,
      name: "newplaylist",
      created_at: expect.any(String),
      deleted_at: null,
      user_id: 1,
      updated_at: expect.any(String),
    });
  });

  it("returns error if no name is provided", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app).post("/v1/playlists").set("Authorization", `Bearer ${jwtToken}`).send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ statusCode: 400, error: "Bad Request", message: expect.any(String) });
    expect(res.body?.message).toMatch(/validation error.*required.*name/i);
  });

  it("returns error if playlist name is not valid format", async () => {
    const testName = async (name: string) => {
      const jwtToken = await getLoginTokenAndTestResult(user_login, app);
      const res = await request(app)
        .post("/v1/playlists")
        .set("Authorization", `Bearer ${jwtToken}`)
        .send({ name })
        .expect(400);
      expect(res.body).toEqual({ statusCode: 400, error: "Bad Request", message: expect.any(String) });
      expect(res.body?.message).toMatch(/validation error.*playlist name/i);
    };
    const badPlaylistNames = ["Newplaylist", "newplaylist!", "new playlist"];
    for (const name of badPlaylistNames) {
      await testName(name);
    }
  });

  it("returns error if name is taken", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app)
      .post("/v1/playlists")
      .set("Authorization", `Bearer ${jwtToken}`)
      .send({ name: "newplaylist" });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ statusCode: 409, error: "Conflict", message: expect.any(String) });
    expect(res.body?.message).toMatch(/playlist name is already taken/i);
  });

  it("returns error if not authenticated", async () => {
    const res = await request(app).post("/v1/playlists").send({ name: "newplaylist" });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ statusCode: 401, error: "Unauthorized", message: expect.any(String) });
    expect(res.body?.message).toMatch(/access token is missing/i);
  });
});

describe("PATCH /v1/playlists/:id", () => {
  it("should enforce i32 id", async () => {
    await i32IdCheck(async (id: any) => {
      const jwtToken = await getLoginTokenAndTestResult(user_login, app);
      return request(app).patch(`/v1/playlists/${id}`).set("Authorization", `Bearer ${jwtToken}`);
    });
  });

  it("should change playlist name successfully", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app)
      .patch("/v1/playlists/788")
      .set("Authorization", `Bearer ${jwtToken}`)
      .send({ name: "patchplaylist" })
      .expect(200);
    expect(res.body).toEqual({
      id: 788,
      name: "patchplaylist",
      created_at: expect.any(String),
      deleted_at: null,
      user_id: 1,
      updated_at: expect.any(String),
    });
  });

  it("should change playlist name back successfully, and should be idempotent", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    let res = await request(app)
      .patch("/v1/playlists/788")
      .set("Authorization", `Bearer ${jwtToken}`)
      .send({ name: "newplaylist" })
      .expect(200);
    res = await request(app)
      .patch("/v1/playlists/788")
      .set("Authorization", `Bearer ${jwtToken}`)
      .send({ name: "newplaylist" })
      .expect(200);
    expect(res.body).toEqual({
      id: 788,
      name: "newplaylist",
      created_at: expect.any(String),
      deleted_at: null,
      user_id: 1,
      updated_at: expect.any(String),
    });
  });

  it("returns error if no name is provided", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app).patch("/v1/playlists/788").set("Authorization", `Bearer ${jwtToken}`).expect(400);
    expect(res.body).toEqual({ statusCode: 400, error: "Bad Request", message: expect.any(String) });
    expect(res.body?.message).toMatch(/validation error.*required/i);
  });

  it("returns error if playlist name is not valid format", async () => {
    const testName = async (name: string) => {
      const jwtToken = await getLoginTokenAndTestResult(user_login, app);
      const res = await request(app)
        .patch("/v1/playlists/788")
        .set("Authorization", `Bearer ${jwtToken}`)
        .send({ name })
        .expect(400);
      expect(res.body).toEqual({ statusCode: 400, error: "Bad Request", message: expect.any(String) });
      expect(res.body?.message).toMatch(/validation error.*playlist name/i);
    };
    const badPlaylistNames = ["Newplaylist", "newplaylist!", "new playlist"];
    for (const name of badPlaylistNames) {
      await testName(name);
    }
  });

  it("returns error if playlist name is already taken", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app)
      .patch("/v1/playlists/788")
      .set("Authorization", `Bearer ${jwtToken}`)
      .send({ name: "greatclips" })
      .expect(409);
    expect(res.body).toEqual({ statusCode: 409, error: "Conflict", message: expect.any(String) });
    expect(res.body?.message).toMatch(/playlist name is already taken/i);
  });

  it("returns error if user does not have permissions to change it", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app)
      .patch(`/v1/playlists/56`)
      .send({ name: "nopermission" })
      .set("Authorization", `Bearer ${jwtToken}`)
      .expect(403);
    expect(res.body).toEqual({ statusCode: 403, error: "Forbidden", message: expect.any(String) });
    expect(res.body?.message).toMatch(/permission.*modify.*playlist/i);
  });

  it("returns error if playlist is not found", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app)
      .patch(`/v1/playlists/404`)
      .send({ name: "notfound" })
      .set("Authorization", `Bearer ${jwtToken}`)
      .expect(404);
    expect(res.body).toEqual({ statusCode: 404, error: "Not Found", message: expect.any(String) });
    expect(res.body?.message).toMatch(/playlist not found/i);
  });
});

describe("DELETE /v1/playlists/:id", () => {
  it("should enforce i32 id", async () => {
    await i32IdCheck(async (id: any) => {
      const jwtToken = await getLoginTokenAndTestResult(user_login, app);
      return request(app).delete(`/v1/playlists/${id}`).set("Authorization", `Bearer ${jwtToken}`);
    });
  });

  it("should soft delete playlist successfully, and be idempotent", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    let res = await request(app).delete(`/v1/playlists/788`).set("Authorization", `Bearer ${jwtToken}`).expect(200);
    res = await request(app).delete(`/v1/playlists/788`).set("Authorization", `Bearer ${jwtToken}`).expect(200);
    expect(res.body).toEqual({
      id: 788,
      name: "newplaylist",
      created_at: expect.any(String),
      deleted_at: expect.any(String),
      user_id: 1,
      updated_at: expect.any(String),
    });
  });

  it("returns error if user does not have permissions to change it", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app).delete(`/v1/playlists/56`).set("Authorization", `Bearer ${jwtToken}`).expect(403);
    expect(res.body).toEqual({ statusCode: 403, error: "Forbidden", message: expect.any(String) });
    expect(res.body?.message).toMatch(/permission.*modify.*playlist/i);
  });

  it("returns error if playlist is not found", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app).delete(`/v1/playlists/404`).set("Authorization", `Bearer ${jwtToken}`).expect(404);
    expect(res.body).toEqual({ statusCode: 404, error: "Not Found", message: expect.any(String) });
    expect(res.body?.message).toMatch(/playlist not found/i);
  });
});

describe("PATCH /v1/playlists/:id/restore", () => {
  it("should enforce i32 id", async () => {
    await i32IdCheck(async (id: any) => {
      const jwtToken = await getLoginTokenAndTestResult(user_login, app);
      return request(app).patch(`/v1/playlists/${id}/restore`).set("Authorization", `Bearer ${jwtToken}`);
    });
  });

  it("should restore playlist successfully, and be idempotent", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    let res = await request(app)
      .patch(`/v1/playlists/788/restore`)
      .send({})
      .set("Authorization", `Bearer ${jwtToken}`)
      .expect(200);
    res = await request(app)
      .patch(`/v1/playlists/788/restore`)
      .send({})
      .set("Authorization", `Bearer ${jwtToken}`)
      .expect(200);
    expect(res.body).toEqual({
      id: 788,
      name: "newplaylist",
      created_at: expect.any(String),
      deleted_at: null,
      user_id: 1,
      updated_at: expect.any(String),
    });
  });

  it("should restore with a name change", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    let res = await request(app).delete(`/v1/playlists/788`).set("Authorization", `Bearer ${jwtToken}`).expect(200);
    res = await request(app)
      .patch(`/v1/playlists/788/restore`)
      .send({ name: "restoredlist" })
      .set("Authorization", `Bearer ${jwtToken}`)
      .expect(200);
    expect(res.body).toEqual({
      id: 788,
      name: "restoredlist",
      created_at: expect.any(String),
      deleted_at: null,
      user_id: 1,
      updated_at: expect.any(String),
    });
  });

  it("returns error if playlist name is not valid format", async () => {
    const testName = async (name: string) => {
      const jwtToken = await getLoginTokenAndTestResult(user_login, app);
      const res = await request(app)
        .patch("/v1/playlists/788/restore")
        .set("Authorization", `Bearer ${jwtToken}`)
        .send({ name })
        .expect(400);
      expect(res.body).toEqual({ statusCode: 400, error: "Bad Request", message: expect.any(String) });
      expect(res.body?.message).toMatch(/validation error.*playlist name/i);
    };
    const badPlaylistNames = ["Newplaylist", "newplaylist!", "new playlist"];
    for (const name of badPlaylistNames) {
      await testName(name);
    }
  });

  it("returns error if playlist name is already taken", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    let res = await request(app).delete(`/v1/playlists/788`).set("Authorization", `Bearer ${jwtToken}`).expect(200);
    res = await request(app)
      .patch(`/v1/playlists/788/restore`)
      .send({ name: "bestclips" })
      .set("Authorization", `Bearer ${jwtToken}`)
      .expect(409);
    expect(res.body).toEqual({ statusCode: 409, error: "Conflict", message: expect.any(String) });
    expect(res.body?.message).toMatch(/playlist name is already taken/i);
  });

  it("returns error if user does not have permissions to change it", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app)
      .patch(`/v1/playlists/56/restore`)
      .send({})
      .set("Authorization", `Bearer ${jwtToken}`)
      .expect(403);
    expect(res.body).toEqual({ statusCode: 403, error: "Forbidden", message: expect.any(String) });
    expect(res.body?.message).toMatch(/permission.*modify.*playlist/i);
  });

  it("returns error if playlist is not found", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app)
      .patch(`/v1/playlists/404/restore`)
      .send({})
      .set("Authorization", `Bearer ${jwtToken}`)
      .expect(404);
    expect(res.body).toEqual({ statusCode: 404, error: "Not Found", message: expect.any(String) });
    expect(res.body?.message).toMatch(/playlist not found/i);
  });
});

describe("POST /v1/playlists/:id/tracks", () => {
  beforeAll(async () => {
    // The restore-conflict test deliberately leaves this shared fixture deleted.
    await db.updateTable("playlists").set({ deleted_at: null }).where("id", "=", 788).execute();
  });
  it("should add tracks to playlist", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app)
      .post("/v1/playlists/788/tracks")
      .set("Authorization", `Bearer ${jwtToken}`)
      .send({ track_ids: [23, 40] })
      .expect(201);
    expect(res.body).toEqual({
      added_track_ids: [23, 40],
      message: "Tracks added successfully to the playlist.",
      playlist_id: 788,
    });
  });

  it("should add tracks to playlist, only ones that haven't been added", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app)
      .post("/v1/playlists/788/tracks")
      .set("Authorization", `Bearer ${jwtToken}`)
      .send({ track_ids: [23, 40] })
      .expect(201);
    expect(res.body).toEqual({
      added_track_ids: [],
      message: "Tracks added successfully to the playlist.",
      playlist_id: 788,
    });
  });

  it("should succeed, but no tracks are added technically, because they are already there", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app)
      .post("/v1/playlists/788/tracks")
      .set("Authorization", `Bearer ${jwtToken}`)
      .send({ track_ids: [23, 40] })
      .expect(201);
    expect(res.body).toEqual({
      added_track_ids: [],
      message: "Tracks added successfully to the playlist.",
      playlist_id: 788,
    });
  });

  it("rejects deleted tracks rather than adding hidden memberships", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    await request(app)
      .post("/v1/playlists/788/tracks")
      .set("Authorization", `Bearer ${jwtToken}`)
      .send({ track_ids: [50] })
      .expect(404);
  });

  it("should return error when provided with empty array", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app)
      .post("/v1/playlists/788/tracks")
      .set("Authorization", `Bearer ${jwtToken}`)
      .send({ track_ids: [] })
      .expect(400);
    expect(res.body).toEqual({ statusCode: 400, error: "Bad Request", message: expect.any(String) });
    expect(res.body?.message).toMatch(/validation error.*at least 1/i);
  });

  it("should return error when provided with non-integer type", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app)
      .post("/v1/playlists/788/tracks")
      .set("Authorization", `Bearer ${jwtToken}`)
      .send({ track_ids: ["bad_type"] })
      .expect(400);
    expect(res.body).toEqual({ statusCode: 400, error: "Bad Request", message: expect.any(String) });
    expect(res.body?.message).toMatch(/validation error.*expected number/i);
  });

  it("should return error if a non-existent track id is provided", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app)
      .post("/v1/playlists/788/tracks")
      .set("Authorization", `Bearer ${jwtToken}`)
      .send({ track_ids: [404] })
      .expect(404);
    expect(res.body).toEqual({ statusCode: 404, error: "Not Found", message: expect.any(String) });
    expect(res.body?.message).toMatch(/Track\(s\) not found/i);
  });

  it("should return error if playlist does not exist", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app)
      .post("/v1/playlists/404/tracks")
      .set("Authorization", `Bearer ${jwtToken}`)
      .send({ track_ids: [40] })
      .expect(404);
    expect(res.body).toEqual({ statusCode: 404, error: "Not Found", message: expect.any(String) });
    expect(res.body?.message).toMatch(/Playlist not found/i);
  });
});

describe("GET /v1/playlists/:id/tracks", () => {
  it("should get tracks from playlist", async () => {
    const res = await request(app).get("/v1/playlists/788/tracks").expect(200);
    expect(res.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 23 }), expect.objectContaining({ id: 40 })]),
    );
  });

  it("should return error if playlist does not exist", async () => {
    const res = await request(app).get("/v1/playlists/404/tracks").expect(404);
    expect(res.body).toEqual({ statusCode: 404, error: "Not Found", message: expect.any(String) });
    expect(res.body?.message).toMatch(/Playlist not found/i);
  });
});

describe("DELETE /v1/playlists/:id/tracks", () => {
  it("should delete track from playlist", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app)
      .delete("/v1/playlists/788/tracks")
      .set("Authorization", `Bearer ${jwtToken}`)
      .send({ track_ids: [40] })
      .expect(200);
    expect(res.body).toEqual({
      deleted_track_ids: [40],
      message: "Playlist track deletion complete.",
      not_in_playlist_track_ids: [],
    });
  });

  it("should properly handle track deletion of track not in the playlist", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app)
      .delete("/v1/playlists/788/tracks")
      .set("Authorization", `Bearer ${jwtToken}`)
      .send({ track_ids: [40] })
      .expect(200);
    expect(res.body).toEqual({
      deleted_track_ids: [],
      message: "Playlist track deletion complete.",
      not_in_playlist_track_ids: [40],
    });
  });

  it("should return error when provided with empty array", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app)
      .delete("/v1/playlists/788/tracks")
      .set("Authorization", `Bearer ${jwtToken}`)
      .send({ track_ids: [] })
      .expect(400);
    expect(res.body).toEqual({ statusCode: 400, error: "Bad Request", message: expect.any(String) });
    expect(res.body?.message).toMatch(/validation error.*at least 1/i);
  });

  it("should return error when provided with non-integer type", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app)
      .delete("/v1/playlists/788/tracks")
      .set("Authorization", `Bearer ${jwtToken}`)
      .send({ track_ids: ["bad_type"] })
      .expect(400);
    expect(res.body).toEqual({ statusCode: 400, error: "Bad Request", message: expect.any(String) });
    expect(res.body?.message).toMatch(/validation error.*expected number/i);
  });

  it("should return 200 even when non-existent track is used", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app)
      .delete("/v1/playlists/788/tracks")
      .set("Authorization", `Bearer ${jwtToken}`)
      .send({ track_ids: [404] })
      .expect(200);
    expect(res.body).toEqual({
      deleted_track_ids: [],
      message: "Playlist track deletion complete.",
      not_in_playlist_track_ids: [404],
    });
  });

  it("should return error if playlist does not exist", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app)
      .delete("/v1/playlists/404/tracks")
      .set("Authorization", `Bearer ${jwtToken}`)
      .send({ track_ids: [40] })
      .expect(404);
    expect(res.body).toEqual({ statusCode: 404, error: "Not Found", message: expect.any(String) });
    expect(res.body?.message).toMatch(/Playlist not found/i);
  });
});

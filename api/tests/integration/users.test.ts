import request from "supertest";
import { appFactory } from "../../src/app";
import { seedUsers } from "../seeds/seedUsers";
import { seedTracks } from "../seeds/seedTracks";
import { seedUserGreetingsAndFarewells } from "../seeds/seedUserGreetingsAndFarewells";
import { seedPlaylists } from "../seeds/seedPlaylists";
import { Kysely } from "kysely";
import { Database } from "../../src/db/schema";
import { dbFactory } from "../../src/db/connection";
import { Express } from "express";
import { configFactory } from "../../src/config/config";
import { Bucket } from "@google-cloud/storage";
import { i32IdCheck } from "../utils";

const DEV_AUTH_SECRET = "TEST_DEV_AUTH_SECRET";
const AUTH_USER_ID = 1;

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
  process.env.DEV_AUTH_SECRET = DEV_AUTH_SECRET;
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
  await seedUserGreetingsAndFarewells(db);
});

afterAll(async () => {
  await db.destroy();
});

describe("GET /v1/users", () => {
  it("should return 200 and a list of users.", async () => {
    const res = await request(app).get("/v1/users");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: 1,
        discord_id: "123711472041781240",
        discord_username: "mr_anderson",
        discord_avatar_hash: null,
        created_at: "2024-11-11T07:21:03.000Z",
        updated_at: "2024-11-11T07:21:03.000Z",
      },
      {
        id: 1337,
        discord_id: "135319472041781248",
        discord_username: "discord_seed_user",
        discord_avatar_hash: null,
        created_at: "2024-12-07T04:29:04.000Z",
        updated_at: "2024-12-07T04:29:04.000Z",
      },
    ]);
  });

  it("should return 200 and a filtered list of users based on discord_id.", async () => {
    const res = await request(app).get("/v1/users?discord_id=135319472041781248");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: 1337,
        discord_id: "135319472041781248",
        discord_username: "discord_seed_user",
        discord_avatar_hash: null,
        created_at: "2024-12-07T04:29:04.000Z",
        updated_at: "2024-12-07T04:29:04.000Z",
      },
    ]);
  });

  it("should return 200 and a filtered list of users based on discord_username.", async () => {
    const res = await request(app).get("/v1/users?discord_username=discord_seed_user");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: 1337,
        discord_id: "135319472041781248",
        discord_username: "discord_seed_user",
        discord_avatar_hash: null,
        created_at: "2024-12-07T04:29:04.000Z",
        updated_at: "2024-12-07T04:29:04.000Z",
      },
    ]);
  });

  it("should return 200 and a filtered list of users when both filters are provided.", async () => {
    const res = await request(app).get("/v1/users?discord_id=123711472041781240&discord_username=mr_anderson");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: 1,
        discord_id: "123711472041781240",
        discord_username: "mr_anderson",
        discord_avatar_hash: null,
        created_at: "2024-11-11T07:21:03.000Z",
        updated_at: "2024-11-11T07:21:03.000Z",
      },
    ]);
  });

  it("should return 200 and an empty list of users when the discord_username does not exist.", async () => {
    const res = await request(app).get("/v1/users?discord_username=does_not_exist");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns error if invalid query parameter is provided", async () => {
    const res = await request(app).get("/v1/users?dne=hello");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ statusCode: 400, error: "Bad Request", message: expect.any(String) });
    expect(res.body?.message).toMatch(/validation error.*dne/i);
  });
});

async function getDevAccessTokenForUserAndTestResult(userId: number) {
  const res = await request(app)
    .post("/v1/dev/sessions")
    .set("x-dev-auth-secret", DEV_AUTH_SECRET)
    .send({ user_id: userId });
  expect(res.status).toBe(201);
  expect(res.body).toEqual({
    access_token: expect.any(String),
    token_type: "Bearer",
    expires_in: expect.any(Number),
    user: { id: userId },
  });
  return res.body.access_token as string;
}

describe("GET /v1/users/@me", () => {
  it("should return 200 and the user", async () => {
    const jwtToken = await getDevAccessTokenForUserAndTestResult(AUTH_USER_ID);
    const res = await request(app).get("/v1/users/@me").set("Authorization", `Bearer ${jwtToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 1,
      discord_id: "123711472041781240",
      discord_username: "mr_anderson",
      discord_avatar_hash: null,
      created_at: "2024-11-11T07:21:03.000Z",
      updated_at: "2024-11-11T07:21:03.000Z",
    });
  });
  // No error conditions require handling at this time
});

describe("GET /v1/users/@me/greeting", () => {
  it("should return 200 and the user greeting", async () => {
    const jwtToken = await getDevAccessTokenForUserAndTestResult(AUTH_USER_ID);
    const res = await request(app).get("/v1/users/@me/greeting").set("Authorization", `Bearer ${jwtToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      greeting_track_id: 23,
      greeting_playlist_id: null,
    });
  });
  // No error conditions require handling at this time
});

describe("GET /v1/users/@me/farewell", () => {
  it("should return 200 and the user farewell", async () => {
    const jwtToken = await getDevAccessTokenForUserAndTestResult(AUTH_USER_ID);
    const res = await request(app).get("/v1/users/@me/farewell").set("Authorization", `Bearer ${jwtToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      farewell_track_id: null,
      farewell_playlist_id: 55,
    });
  });
  // No error conditions require handling at this time
});

describe("GET /v1/users/:id", () => {
  it("should return 200 and the user", async () => {
    const res = await request(app).get("/v1/users/1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 1,
      discord_id: "123711472041781240",
      discord_username: "mr_anderson",
      discord_avatar_hash: null,
      created_at: "2024-11-11T07:21:03.000Z",
      updated_at: "2024-11-11T07:21:03.000Z",
    });
  });

  it("returns error if invalid user_id is provided", async () => {
    const res = await request(app).get("/v1/users/404");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ statusCode: 404, error: "Not Found", message: expect.any(String) });
    expect(res.body?.message).toMatch(/user not found/i);
  });

  it("id should be i32", async () => {
    await i32IdCheck(async (id: any) => {
      return request(app).get(`/v1/users/${id}`);
    });
  });
});

describe("GET /v1/users/:id/greeting", () => {
  it("should return 200 and the user greeting", async () => {
    const res = await request(app).get("/v1/users/1/greeting");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      greeting_track_id: 23,
      greeting_playlist_id: null,
    });
  });

  it("id should be i32", async () => {
    await i32IdCheck(async (id: any) => {
      return request(app).get(`/v1/users/${id}/greeting`);
    });
  });
});

describe("GET /v1/users/:id/farewell", () => {
  it("should return 200 and the user farewell", async () => {
    const res = await request(app).get("/v1/users/1/farewell");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      farewell_track_id: null,
      farewell_playlist_id: 55,
    });
  });

  it("id should be i32", async () => {
    await i32IdCheck(async (id: any) => {
      return request(app).get(`/v1/users/${id}/farewell`);
    });
  });
});

describe("PATCH /v1/users/@me", () => {
  it("updates the discord_username", async () => {
    const jwtToken = await getDevAccessTokenForUserAndTestResult(AUTH_USER_ID);
    let res = await request(app)
      .patch("/v1/users/@me")
      .send({ discord_username: "neo" })
      .set("Authorization", `Bearer ${jwtToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 1,
      discord_id: "123711472041781240",
      discord_username: "neo",
      discord_avatar_hash: null,
      created_at: "2024-11-11T07:21:03.000Z",
      updated_at: expect.any(String),
    });

    res = await request(app)
      .patch("/v1/users/@me")
      .send({ discord_username: "mr_anderson" })
      .set("Authorization", `Bearer ${jwtToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 1,
      discord_id: "123711472041781240",
      discord_username: "mr_anderson",
      discord_avatar_hash: null,
      created_at: "2024-11-11T07:21:03.000Z",
      updated_at: expect.any(String),
    });
  });

  it("updates the discord_avatar_hash", async () => {
    const jwtToken = await getDevAccessTokenForUserAndTestResult(AUTH_USER_ID);
    let res = await request(app)
      .patch("/v1/users/@me")
      .send({ discord_avatar_hash: "hash123" })
      .set("Authorization", `Bearer ${jwtToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 1,
      discord_id: "123711472041781240",
      discord_username: "mr_anderson",
      discord_avatar_hash: "hash123",
      created_at: "2024-11-11T07:21:03.000Z",
      updated_at: expect.any(String),
    });

    res = await request(app)
      .patch("/v1/users/@me")
      .send({ discord_avatar_hash: null })
      .set("Authorization", `Bearer ${jwtToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 1,
      discord_id: "123711472041781240",
      discord_username: "mr_anderson",
      discord_avatar_hash: null,
      created_at: "2024-11-11T07:21:03.000Z",
      updated_at: expect.any(String),
    });
  });
});

describe("PATCH /v1/users/:id", () => {
  it("updates discord_username for the specified user", async () => {
    const jwtToken = await getDevAccessTokenForUserAndTestResult(AUTH_USER_ID);
    let res = await request(app)
      .patch("/v1/users/1")
      .send({ discord_username: "neo" })
      .set("Authorization", `Bearer ${jwtToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 1,
      discord_id: "123711472041781240",
      discord_username: "neo",
      discord_avatar_hash: null,
      created_at: "2024-11-11T07:21:03.000Z",
      updated_at: expect.any(String),
    });

    res = await request(app)
      .patch("/v1/users/1")
      .send({ discord_username: "mr_anderson" })
      .set("Authorization", `Bearer ${jwtToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 1,
      discord_id: "123711472041781240",
      discord_username: "mr_anderson",
      discord_avatar_hash: null,
      created_at: "2024-11-11T07:21:03.000Z",
      updated_at: expect.any(String),
    });
  });
});

async function greetingFarewellChecks(type: "greeting" | "farewell", endpoint: string) {
  const castSalutation = (salutation: { track_id: any; playlist_id: any }) => {
    return type === "greeting"
      ? { greeting_track_id: salutation.track_id, greeting_playlist_id: salutation.playlist_id }
      : { farewell_track_id: salutation.track_id, farewell_playlist_id: salutation.playlist_id };
  };

  const sendAndCheckValidSalutationPutRequest = async (salutation: { track_id: any; playlist_id: any }) => {
    const jwtToken = await getDevAccessTokenForUserAndTestResult(AUTH_USER_ID);
    const res = await request(app)
      .put(endpoint)
      .send(castSalutation(salutation))
      .set("Authorization", `Bearer ${jwtToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(castSalutation(salutation));
  };

  const sendAndCheckInvalidSalutationPutRequest = async (
    salutation: { track_id: any; playlist_id: any },
    statusCode: 400 | 404,
    errorRegex: RegExp,
  ) => {
    const jwtToken = await getDevAccessTokenForUserAndTestResult(AUTH_USER_ID);
    let res = await request(app)
      .put(endpoint)
      .send(castSalutation(salutation))
      .set("Authorization", `Bearer ${jwtToken}`);
    expect(res.status).toBe(statusCode);
    const errorStringLookup = {
      400: "Bad Request",
      404: "Not Found",
    };
    expect(res.body).toEqual({ statusCode, error: errorStringLookup[statusCode], message: expect.any(String) });
    expect(res.body?.message).toMatch(errorRegex);
  };

  it(`should update user ${type} track`, async () => {
    await sendAndCheckValidSalutationPutRequest({ track_id: 40, playlist_id: null });
  });

  it(`should update user ${type} playlist`, async () => {
    if (type === "farewell") {
      await sendAndCheckInvalidSalutationPutRequest({ track_id: null, playlist_id: 55 }, 400, /less than 4 seconds/i);
    } else {
      await sendAndCheckValidSalutationPutRequest({ track_id: null, playlist_id: 55 });
    }
  });

  it(`should clear user ${type}`, async () => {
    await sendAndCheckValidSalutationPutRequest({ track_id: null, playlist_id: null });
  });

  it("track must be int", async () => {
    await sendAndCheckInvalidSalutationPutRequest(
      { track_id: "hello", playlist_id: null },
      400,
      new RegExp(`validation error.*string.*${type}_track_id`, "i"),
    );
  });

  it("playlist must be int", async () => {
    await sendAndCheckInvalidSalutationPutRequest(
      { track_id: null, playlist_id: "hello" },
      400,
      new RegExp(`validation error.*string.*${type}_playlist_id`, "i"),
    );
  });

  it("cannot be both not null", async () => {
    await sendAndCheckInvalidSalutationPutRequest(
      { track_id: 1, playlist_id: 1 },
      400,
      new RegExp(`validation error.*only one ${type} id`, "i"),
    );
  });

  it("track must exist", async () => {
    await sendAndCheckInvalidSalutationPutRequest({ track_id: 88, playlist_id: null }, 404, /track not found/i);
  });

  it("playlist must exist", async () => {
    await sendAndCheckInvalidSalutationPutRequest({ track_id: null, playlist_id: 88 }, 404, /playlist not found/i);
  });
}

describe("PUT /v1/users/@me/greeting", () => {
  greetingFarewellChecks("greeting", "/v1/users/@me/greeting");
});

describe("PUT /v1/users/@me/farewell", () => {
  greetingFarewellChecks("farewell", "/v1/users/@me/farewell");
});

describe("PUT /v1/users/:id/greeting", () => {
  greetingFarewellChecks("greeting", "/v1/users/1/greeting");
});

describe("PUT /v1/users/:id/farewell", () => {
  greetingFarewellChecks("farewell", "/v1/users/1/farewell");
});

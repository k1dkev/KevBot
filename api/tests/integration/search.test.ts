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

const names = (items: any[]) => items.map((i) => i.name);
const types = (items: any[]) => items.map((i) => i.type);

describe("GET /v1/search — browse mode (no q)", () => {
  it("type=tracks returns tracks sorted by name asc by default", async () => {
    const res = await request(app).get("/v1/search?type=tracks");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(types(res.body.data)).toEqual(["track", "track"]);
    expect(names(res.body.data)).toEqual(["happynewyear", "yes"]);
    expect(res.body.data[0]).toEqual({
      type: "track",
      id: 23,
      name: "happynewyear",
      created_at: "2024-12-11T07:21:03.000Z",
      deleted_at: null,
      relevance: null,
      duration: 5.328,
      total_play_count: 0,
      raw_total_play_count: 0,
      user: { id: 1337, display_name: "discord_seed_user" },
    });
    expect(res.body.pagination).toEqual({
      total: 2,
      limit: 20,
      offset: 0,
      has_next: false,
      has_prev: false,
    });
  });

  it("type=playlists returns playlists sorted by name asc by default", async () => {
    const res = await request(app).get("/v1/search?type=playlists");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(types(res.body.data)).toEqual(["playlist", "playlist"]);
    expect(names(res.body.data)).toEqual(["bestclips", "greatclips"]);
    expect(res.body.data[0]).toEqual({
      type: "playlist",
      id: 55,
      name: "bestclips",
      created_at: "2024-12-13T21:03:00.000Z",
      deleted_at: null,
      relevance: null,
      track_count: 1,
      user: { id: 1, display_name: "mr_anderson" },
    });
  });

  it("type=playlists&user_id=1 narrows to that user's playlists", async () => {
    const res = await request(app).get("/v1/search?type=playlists&user_id=1");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe("bestclips");
    expect(res.body.data[0].user).toEqual({ id: 1, display_name: "mr_anderson" });
  });

  it("type=users returns users sorted by name asc by default", async () => {
    const res = await request(app).get("/v1/search?type=users");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(types(res.body.data)).toEqual(["user", "user"]);
    expect(names(res.body.data)).toEqual(["discord_seed_user", "mr_anderson"]);
    expect(res.body.data[0]).toEqual({
      type: "user",
      id: 1337,
      name: "discord_seed_user",
      created_at: "2024-12-07T04:29:04.000Z",
      deleted_at: null,
      relevance: null,
    });
  });

  it("type=all (default) returns mixed types sorted by name asc", async () => {
    const res = await request(app).get("/v1/search");
    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(6);
    // bestclips (pl), discord_seed_user (u), greatclips (pl), happynewyear (t), mr_anderson (u), yes (t)
    expect(names(res.body.data)).toEqual([
      "bestclips",
      "discord_seed_user",
      "greatclips",
      "happynewyear",
      "mr_anderson",
      "yes",
    ]);
    expect(types(res.body.data)).toEqual(["playlist", "user", "playlist", "track", "user", "track"]);
  });

  it("type=all honors sort=created_at desc", async () => {
    const res = await request(app).get("/v1/search?sort=created_at&order=desc");
    expect(res.status).toBe(200);
    const dates = res.body.data.map((i: any) => new Date(i.created_at).getTime());
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i]);
    }
  });
});

describe("GET /v1/search — search mode (with q)", () => {
  it("type=tracks returns hybrid-ranked tracks when q is provided", async () => {
    const res = await request(app).get("/v1/search?q=happy&type=tracks");
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.some((i: any) => i.name === "happynewyear")).toBe(true);
    expect(res.body.data[0].relevance).toEqual(expect.any(Number));
  });

  it("type=playlists returns hybrid-ranked playlists", async () => {
    const res = await request(app).get("/v1/search?q=best&type=playlists");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe("bestclips");
    expect(res.body.data[0].relevance).toEqual(expect.any(Number));
  });

  it("type=users returns hybrid-ranked users on username prefix", async () => {
    const res = await request(app).get("/v1/search?q=mr&type=users");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe("mr_anderson");
  });

  it("type=all returns matches across all three types", async () => {
    const res = await request(app).get("/v1/search?q=best&type=all");
    expect(res.status).toBe(200);
    expect(res.body.data.some((i: any) => i.type === "playlist" && i.name === "bestclips")).toBe(true);
    expect(res.body.data.every((i: any) => typeof i.relevance === "number")).toBe(true);
  });

  it("trims whitespace around q", async () => {
    const res = await request(app).get("/v1/search?q=%20happy%20&type=tracks");
    expect(res.status).toBe(200);
    expect(res.body.data.some((i: any) => i.name === "happynewyear")).toBe(true);
  });
});

describe("GET /v1/search — filters", () => {
  it("playlist_id with type=tracks narrows to that playlist's tracks", async () => {
    const res = await request(app).get("/v1/search?type=tracks&playlist_id=55");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(23);
  });

  it("user_id with type=tracks narrows to that user's tracks", async () => {
    const res = await request(app).get("/v1/search?type=tracks&user_id=1");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe("yes");
  });
});

describe("GET /v1/search — validation 400s", () => {
  it("rejects playlist_id with type=all", async () => {
    const res = await request(app).get("/v1/search?playlist_id=55");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/playlist_id.*type=tracks/i);
  });

  it("rejects playlist_id with type=playlists", async () => {
    const res = await request(app).get("/v1/search?type=playlists&playlist_id=55");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/playlist_id.*type=tracks/i);
  });

  it("rejects playlist_id with type=users", async () => {
    const res = await request(app).get("/v1/search?type=users&playlist_id=55");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/playlist_id.*type=tracks/i);
  });

  it("rejects user_id with type=users", async () => {
    const res = await request(app).get("/v1/search?type=users&user_id=1");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/user_id.*type=tracks.*playlists/i);
  });

  it("rejects user_id with type=all", async () => {
    const res = await request(app).get("/v1/search?user_id=1");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/user_id.*type=tracks.*playlists/i);
  });

  it("rejects sort=relevance without q", async () => {
    const res = await request(app).get("/v1/search?sort=relevance");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/relevance.*requires.*q/i);
  });

  it("rejects sort=play_count with type=users", async () => {
    const res = await request(app).get("/v1/search?type=users&sort=play_count");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/play_count.*type=tracks/i);
  });

  it("rejects sort=play_count with type=playlists", async () => {
    const res = await request(app).get("/v1/search?type=playlists&sort=play_count");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/play_count.*type=tracks/i);
  });

  it("rejects sort=play_count with type=all", async () => {
    const res = await request(app).get("/v1/search?sort=play_count");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/play_count.*type=tracks/i);
  });

  it("rejects empty q (after trim)", async () => {
    const res = await request(app).get("/v1/search?q=%20%20");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/query.*non-empty/i);
  });

  it("rejects negative limit", async () => {
    const res = await request(app).get("/v1/search?limit=-1");
    expect(res.status).toBe(400);
  });

  it("rejects negative offset", async () => {
    const res = await request(app).get("/v1/search?offset=-1");
    expect(res.status).toBe(400);
  });

  it("rejects unknown query parameter", async () => {
    const res = await request(app).get("/v1/search?bogus=1");
    expect(res.status).toBe(400);
  });

  it("rejects invalid type enum value", async () => {
    const res = await request(app).get("/v1/search?type=invalid");
    expect(res.status).toBe(400);
  });
});

describe("GET /v1/search — pagination", () => {
  it("reports has_next=true and has_prev=false at first page", async () => {
    const res = await request(app).get("/v1/search?type=tracks&limit=1");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination).toEqual({
      total: 2,
      limit: 1,
      offset: 0,
      has_next: true,
      has_prev: false,
    });
  });

  it("reports has_next=false and has_prev=true at last page", async () => {
    const res = await request(app).get("/v1/search?type=tracks&limit=1&offset=1");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination).toEqual({
      total: 2,
      limit: 1,
      offset: 1,
      has_next: false,
      has_prev: true,
    });
  });

  it("paginates type=all across merged results", async () => {
    const page1 = await request(app).get("/v1/search?limit=3&offset=0");
    const page2 = await request(app).get("/v1/search?limit=3&offset=3");
    expect(page1.status).toBe(200);
    expect(page2.status).toBe(200);
    expect(page1.body.pagination.total).toBe(6);
    expect(page1.body.pagination.has_next).toBe(true);
    expect(page2.body.pagination.has_next).toBe(false);
    expect(page2.body.pagination.has_prev).toBe(true);
    const allNames = [...page1.body.data, ...page2.body.data].map((i: any) => i.name);
    expect(allNames).toEqual([
      "bestclips",
      "discord_seed_user",
      "greatclips",
      "happynewyear",
      "mr_anderson",
      "yes",
    ]);
  });
});

describe("GET /v1/search — soft delete", () => {
  it("excludes soft-deleted tracks by default", async () => {
    const res = await request(app).get("/v1/search?type=tracks");
    expect(res.status).toBe(200);
    expect(res.body.data.every((i: any) => i.deleted_at === null)).toBe(true);
    expect(res.body.data.find((i: any) => i.name === "deletedtrack")).toBeUndefined();
  });

  it("includes soft-deleted tracks with include_deleted=true", async () => {
    const res = await request(app).get("/v1/search?type=tracks&include_deleted=true");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    const deleted = res.body.data.find((i: any) => i.name === "deletedtrack");
    expect(deleted).toBeDefined();
    expect(deleted.deleted_at).toEqual(expect.any(String));
  });

  it("excludes soft-deleted playlists by default", async () => {
    const res = await request(app).get("/v1/search?type=playlists");
    expect(res.status).toBe(200);
    expect(res.body.data.every((i: any) => i.deleted_at === null)).toBe(true);
    expect(res.body.data.find((i: any) => i.name === "deletedplaylist")).toBeUndefined();
  });

  it("includes soft-deleted playlists with include_deleted=true", async () => {
    const res = await request(app).get("/v1/search?type=playlists&include_deleted=true");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    const deleted = res.body.data.find((i: any) => i.name === "deletedplaylist");
    expect(deleted).toBeDefined();
    expect(deleted.deleted_at).toEqual(expect.any(String));
  });
});

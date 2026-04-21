import request from "supertest";
import { appFactory } from "../../src/app";
import { seedUsers } from "../seeds/seedUsers";
import { seedTracks } from "../seeds/seedTracks";
import { Kysely } from "kysely";
import { Database } from "../../src/db/schema";
import { dbFactory } from "../../src/db/connection";
import { Express } from "express";
import { AppConfig, configFactory } from "../../src/config/config";
import { i32IdCheck, getLoginTokenAndTestResult, fixturePath } from "../utils";
import { GenericContainer, StartedTestContainer, Wait } from "testcontainers";
import { Storage } from "@google-cloud/storage";
import { tracksBucketFactory } from "../../src/storage/tracksBucket";
import { user_login } from "../seeds/seedUsers";
import fs from "fs";
import { getTrackMetaData, verifyLoudnessNormalization } from "../../src/utils/audioUtils";
import path from "path";

let db: Kysely<Database>;
let app: Express;
let gcsContainer: StartedTestContainer;
let appConfig: AppConfig;

const TMP_DIR = path.join(__dirname, "tmp");
const tmpPath = (fileName: string) => path.join(TMP_DIR, fileName);

beforeAll(async () => {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }

  const GCS_PORT = 4443;
  gcsContainer = await new GenericContainer("fsouza/fake-gcs-server")
    .withExposedPorts(GCS_PORT)
    .withCommand(["-scheme", "http"])
    .withWaitStrategy(Wait.forListeningPorts())
    .withStartupTimeout(120000)
    .start();
  const gcsPort = gcsContainer.getMappedPort(GCS_PORT);
  const gcsHost = gcsContainer.getHost();
  process.env.GCP_API_ENDPOINT = `http://${gcsHost}:${gcsPort}`;
  const storage = new Storage({
    projectId: "TODO-CHANGE-THIS",
    apiEndpoint: process.env.GCP_API_ENDPOINT,
  });
  process.env.GCP_TRACKS_BUCKET_NAME = "kevbot-tracks-testing";
  await storage.createBucket(process.env.GCP_TRACKS_BUCKET_NAME);

  // TODO: improve management of environment variables
  process.env.KEVBOT_API_ADDRESS = "0.0.0.0";
  process.env.KEVBOT_API_JWT_SECRET = "jwt_secret";
  process.env.KEVBOT_API_PORT = "3000";
  process.env.DEV_ROUTES_ALLOWED = "true";
  process.env.DEV_AUTH_SECRET = "TEST_DEV_AUTH_SECRET";
  process.env.DISCORD_OAUTH2_REDIRECT_URI = "http://dummy.com";
  process.env.DISCORD_OAUTH2_CLIENT_ID = "dummy";
  process.env.DISCORD_OAUTH2_CLIENT_SECRET = "dummy";
  appConfig = configFactory();
  const { config, secrets } = appConfig;
  const tracksBucket = tracksBucketFactory(secrets.GCP_API_ENDPOINT, secrets.GCP_TRACKS_BUCKET_NAME);
  db = dbFactory(secrets.DB_CONNECTION_STRING);
  app = appFactory(config, secrets, db, tracksBucket);
  await seedUsers(db);
  await seedTracks(db);
}, 120000);

afterAll(async () => {
  if (fs.existsSync(TMP_DIR)) {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  }

  await db.destroy();
  await gcsContainer.stop();
});

describe("GET /v1/tracks", () => {
  it("should return a list of tracks sorted by created_at desc", async () => {
    const res = await request(app).get("/v1/tracks");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: [
        {
          id: 40,
          name: "yes",
          created_at: "2024-12-11T08:21:03.000Z",
          user_id: 1,
          duration: 3.713,
          updated_at: "2024-12-11T08:21:03.000Z",
          deleted_at: null,
          raw_total_play_count: 0,
          total_play_count: 0,
        },
        {
          id: 23,
          name: "happynewyear",
          created_at: "2024-12-11T07:21:03.000Z",
          user_id: 1337,
          duration: 5.328,
          updated_at: "2024-12-11T07:21:03.000Z",
          deleted_at: null,
          raw_total_play_count: 0,
          total_play_count: 0,
        },
      ],
      pagination: {
        total: 2,
        limit: 20,
        offset: 0,
        hasNext: false,
        hasPrev: false,
      },
    });
  });

  it("excludes soft-deleted tracks by default", async () => {
    const res = await request(app).get("/v1/tracks");
    expect(res.status).toBe(200);
    expect(res.body.data.find((t: any) => t.name === "deletedtrack")).toBeUndefined();
  });

  it("includes soft-deleted tracks when include_deleted=true", async () => {
    const res = await request(app).get("/v1/tracks?include_deleted=true");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    const deleted = res.body.data.find((t: any) => t.name === "deletedtrack");
    expect(deleted).toBeDefined();
    expect(deleted.deleted_at).toEqual(expect.any(String));
  });

  it("filters by user_id", async () => {
    const res = await request(app).get("/v1/tracks?user_id=1");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe("yes");
  });

  it("returns error if invalid query parameter is provided", async () => {
    const res = await request(app).get("/v1/tracks?dne=hello");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ statusCode: 400, error: "Bad Request", message: expect.any(String) });
    expect(res.body?.message).toMatch(/validation error.*dne/i);
  });

  describe("pagination", () => {
    it("should support limit parameter", async () => {
      const res = await request(app).get("/v1/tracks?limit=1");
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.pagination.limit).toBe(1);
      expect(res.body.pagination.hasNext).toBe(true);
    });

    it("should support offset parameter", async () => {
      const res = await request(app).get("/v1/tracks?limit=1&offset=1");
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.pagination.offset).toBe(1);
      expect(res.body.pagination.hasPrev).toBe(true);
      expect(res.body.pagination.hasNext).toBe(false);
    });
  });
});

describe("GET /v1/tracks/:id", () => {
  it("should enforce i32 id", async () => {
    await i32IdCheck(async (id: any) => {
      return request(app).get(`/v1/tracks/${id}`);
    });
  });

  it("should return 200 and the track", async () => {
    const res = await request(app).get("/v1/tracks/23");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 23,
      name: "happynewyear",
      created_at: "2024-12-11T07:21:03.000Z",
      user_id: 1337,
      duration: 5.328,
      updated_at: "2024-12-11T07:21:03.000Z",
      deleted_at: null,
      raw_total_play_count: 0,
      total_play_count: 0,
    });
  });

  it("returns not found if invalid track id is provided", async () => {
    const res = await request(app).get("/v1/tracks/404");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ statusCode: 404, error: "Not Found", message: expect.any(String) });
    expect(res.body?.message).toMatch(/track not found/i);
  });
});

describe("POST /v1/tracks/", () => {
  it("should upload track and return metadata", async () => {
    const filePath = fixturePath("boysareback.mp3");
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app)
      .post("/v1/tracks")
      .field("name", "boysareback")
      .attach("file", filePath)
      .set("Authorization", `Bearer ${jwtToken}`);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: 51,
      name: "boysareback",
      created_at: expect.any(String),
      user_id: 1,
      duration: 4.392,
      updated_at: expect.any(String),
      deleted_at: null,
      raw_total_play_count: 0,
      total_play_count: 0,
    });
  }, 10000);

  it("returns error if no name is provided", async () => {
    const filePath = fixturePath("boysareback.mp3");
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app)
      .post("/v1/tracks")
      .attach("file", filePath)
      .set("Authorization", `Bearer ${jwtToken}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ statusCode: 400, error: "Bad Request", message: expect.any(String) });
    expect(res.body?.message).toMatch(/validation error.*required.*name/i);
  });

  it("returns error if track name has upper-case letters", async () => {
    const filePath = fixturePath("boysareback.mp3");
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app)
      .post("/v1/tracks")
      .field("name", "Boysareback")
      .attach("file", filePath)
      .set("Authorization", `Bearer ${jwtToken}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ statusCode: 400, error: "Bad Request", message: expect.any(String) });
    expect(res.body?.message).toMatch(/validation error.*track name/i);
  });

  it("returns error if track name has special characters", async () => {
    const filePath = fixturePath("boysareback.mp3");
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app)
      .post("/v1/tracks")
      .field("name", "boysareback!")
      .attach("file", filePath)
      .set("Authorization", `Bearer ${jwtToken}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ statusCode: 400, error: "Bad Request", message: expect.any(String) });
    expect(res.body?.message).toMatch(/validation error.*track name/i);
  });

  it("returns error if track name has spaces", async () => {
    const filePath = fixturePath("boysareback.mp3");
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app)
      .post("/v1/tracks")
      .field("name", "boys are back")
      .attach("file", filePath)
      .set("Authorization", `Bearer ${jwtToken}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ statusCode: 400, error: "Bad Request", message: expect.any(String) });
    expect(res.body?.message).toMatch(/validation error.*track name/i);
  });

  it("returns error if no file is given", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app)
      .post("/v1/tracks")
      .field("name", "boysareback")
      .set("Authorization", `Bearer ${jwtToken}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ statusCode: 400, error: "Bad Request", message: expect.any(String) });
    expect(res.body?.message).toMatch(/file is required/i);
  });

  it("returns error if name is taken", async () => {
    const filePath = fixturePath("boysareback.mp3");
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app)
      .post("/v1/tracks")
      .field("name", "boysareback")
      .attach("file", filePath)
      .set("Authorization", `Bearer ${jwtToken}`);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ statusCode: 409, error: "Conflict", message: expect.any(String) });
    expect(res.body?.message).toMatch(/track name is already taken/i);
  });

  it("returns error if file is not an mp3", async () => {
    const filePath = fixturePath("notanmp3.txt");
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app)
      .post("/v1/tracks")
      .field("name", "notanmp3")
      .attach("file", filePath)
      .set("Authorization", `Bearer ${jwtToken}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ statusCode: 400, error: "Bad Request", message: expect.any(String) });
    expect(res.body?.message).toMatch(/invalid file extension/i);
  });

  it("returns error if file is not a valid mp3 file, but has the extension", async () => {
    const filePath = fixturePath("fakemp3.mp3");
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app)
      .post("/v1/tracks")
      .field("name", "fakemp3")
      .attach("file", filePath)
      .set("Authorization", `Bearer ${jwtToken}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ statusCode: 400, error: "Bad Request", message: expect.any(String) });
    expect(res.body?.message).toMatch(/unsupported or corrupt file was received/i);
  });

  it("returns error if not authenticated", async () => {
    const filePath = fixturePath("boysareback.mp3");
    // Connection keep-alive is needed to prevent random "write EPIPE" errors
    const res = await request(app)
      .post("/v1/tracks")
      .field("name", "boysareback")
      .attach("file", filePath)
      .set("Connection", "keep-alive");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ statusCode: 401, error: "Unauthorized", message: expect.any(String) });
    expect(res.body?.message).toMatch(/access token is missing/i);
  }, 10000);
});

describe("GET /v1/tracks/:id/download", () => {
  it("should enforce i32 id", async () => {
    await i32IdCheck(async (id: any) => {
      return request(app).get(`/v1/tracks/${id}/download`);
    });
  });

  it("should download the track successfully", async () => {
    const res = await request(app)
      .get(`/v1/tracks/51/download`)
      .expect("Content-Type", "audio/mpeg")
      .expect("Content-Disposition", 'attachment; filename="boysareback.mp3"')
      .expect(200);
    fs.writeFileSync(tmpPath("boysareback_download.mp3"), res.body);
  });

  it("original file should fail normalization check", async () => {
    let originalFileIsNotNormalized = false;
    try {
      await verifyLoudnessNormalization(
        fixturePath("boysareback.mp3"),
        appConfig.config.acceptableIntegratedLoudnessBand
      );
    } catch (err) {
      originalFileIsNotNormalized = true;
    }
    expect(originalFileIsNotNormalized).toBe(true);
  });

  it("downloaded file should pass normalization check", async () => {
    let downloadedFileIsNormalized = true;
    try {
      await verifyLoudnessNormalization(
        tmpPath("boysareback_download.mp3"),
        appConfig.config.acceptableIntegratedLoudnessBand
      );
    } catch (err) {
      downloadedFileIsNormalized = false;
    }
    expect(downloadedFileIsNormalized).toBe(true);
  });

  it("should produce a download file in similar length to original", async () => {
    const originalMetadata = await getTrackMetaData(fixturePath("boysareback.mp3"));
    const downloadMetadata = await getTrackMetaData(tmpPath("boysareback_download.mp3"));
    if (!originalMetadata.format.duration || !downloadMetadata.format.duration) {
      throw new Error("Duration not defined for files.");
    }
    const durationDifference = Math.abs(originalMetadata.format.duration - downloadMetadata.format.duration);
    expect(durationDifference).toBeLessThanOrEqual(appConfig.config.acceptableDurationChangeInSeconds);
  });

  it("returns not found if track does not exist", async () => {
    const res = await request(app).get(`/v1/tracks/99/download`).expect(404);
    expect(res.body).toEqual({ statusCode: 404, error: "Not Found", message: expect.any(String) });
    expect(res.body?.message).toMatch(/track not found/i);
  });
});

describe("GET /v1/tracks/:id/stream", () => {
  it("should enforce i32 id", async () => {
    await i32IdCheck(async (id: any) => {
      return request(app).get(`/v1/tracks/${id}/stream`);
    });
  });

  it("should stream the track successfully", async () => {
    const res = await request(app)
      .get(`/v1/tracks/51/stream`)
      .expect("Content-Type", "audio/mpeg")
      .expect("Accept-Ranges", "bytes")
      .expect("Content-Disposition", 'inline; filename="boysareback.mp3"')
      .expect(200);
    const fixtureBuffer = fs.readFileSync(tmpPath("boysareback_download.mp3"));
    expect(res.body.equals(fixtureBuffer)).toBe(true);
  });

  it("should support range requests", async () => {
    const res = await request(app)
      .get(`/v1/tracks/51/stream`)
      .set("Range", "bytes=0-1023")
      .expect("Content-Type", "audio/mpeg")
      .expect("Accept-Ranges", "bytes")
      .expect("Content-Disposition", 'inline; filename="boysareback.mp3"')
      .expect("Content-Length", "1024")
      .expect(206);
    expect(res.headers["content-range"]).toMatch(/bytes 0-1023\/\d+/);
    expect(res.body.length).toBe(1024);
  });

  it("returns not found if track does not exist", async () => {
    const res = await request(app).get(`/v1/tracks/99/download`).expect(404);
    expect(res.body).toEqual({ statusCode: 404, error: "Not Found", message: expect.any(String) });
    expect(res.body?.message).toMatch(/track not found/i);
  });

  it("returns error if range provided is not valid", async () => {
    const res = await request(app).get(`/v1/tracks/51/stream`).set("Range", "bytes=0-1000000000000").expect(416);
    expect(res.body).toEqual({
      statusCode: 416,
      error: "Requested Range Not Satisfiable",
      message: expect.any(String),
    });
    expect(res.body?.message).toMatch(/requested range not satisfiable \d*-\d*/i);
  });
});

describe("PATCH /v1/tracks/:id", () => {
  it("should enforce i32 id", async () => {
    await i32IdCheck(async (id: any) => {
      const jwtToken = await getLoginTokenAndTestResult(user_login, app);
      return request(app).patch(`/v1/tracks/${id}`).set("Authorization", `Bearer ${jwtToken}`);
    });
  });

  it("should change track name successfully", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app)
      .patch(`/v1/tracks/51`)
      .send({ name: "boysrback" })
      .set("Authorization", `Bearer ${jwtToken}`)
      .expect(200);
    expect(res.body).toEqual({
      id: 51,
      name: "boysrback",
      created_at: expect.any(String),
      user_id: 1,
      duration: 4.392,
      updated_at: expect.any(String),
      deleted_at: null,
      raw_total_play_count: 0,
      total_play_count: 0,
    });
  });

  it("should change track name back successfully, and should be idempotent", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    let res = await request(app)
      .patch(`/v1/tracks/51`)
      .send({ name: "boysareback" })
      .set("Authorization", `Bearer ${jwtToken}`)
      .expect(200);
    res = await request(app)
      .patch(`/v1/tracks/51`)
      .send({ name: "boysareback" })
      .set("Authorization", `Bearer ${jwtToken}`)
      .expect(200);
    expect(res.body).toEqual({
      id: 51,
      name: "boysareback",
      created_at: expect.any(String),
      user_id: 1,
      duration: 4.392,
      updated_at: expect.any(String),
      deleted_at: null,
      raw_total_play_count: 0,
      total_play_count: 0,
    });
  });

  it("returns error if no name is provided", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app).patch(`/v1/tracks/51`).set("Authorization", `Bearer ${jwtToken}`).expect(400);
    expect(res.body).toEqual({ statusCode: 400, error: "Bad Request", message: expect.any(String) });
    expect(res.body?.message).toMatch(/validation error.*required/i);
  });

  it("returns error if track name has upper-case letters", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app)
      .patch(`/v1/tracks/51`)
      .send({ name: "Boysareback" })
      .set("Authorization", `Bearer ${jwtToken}`)
      .expect(400);
    expect(res.body).toEqual({ statusCode: 400, error: "Bad Request", message: expect.any(String) });
    expect(res.body?.message).toMatch(/validation error.*track name/i);
  });

  it("returns error if track name has special characters", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app)
      .patch(`/v1/tracks/51`)
      .send({ name: "boysareback!" })
      .set("Authorization", `Bearer ${jwtToken}`)
      .expect(400);
    expect(res.body).toEqual({ statusCode: 400, error: "Bad Request", message: expect.any(String) });
    expect(res.body?.message).toMatch(/validation error.*track name/i);
  });

  it("returns error if track name has spaces", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app)
      .patch(`/v1/tracks/51`)
      .send({ name: "boys are back" })
      .set("Authorization", `Bearer ${jwtToken}`)
      .expect(400);
    expect(res.body).toEqual({ statusCode: 400, error: "Bad Request", message: expect.any(String) });
    expect(res.body?.message).toMatch(/validation error.*track name/i);
  });

  it("returns error if track name is already taken", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app)
      .patch(`/v1/tracks/51`)
      .send({ name: "happynewyear" })
      .set("Authorization", `Bearer ${jwtToken}`)
      .expect(409);
    expect(res.body).toEqual({ statusCode: 409, error: "Conflict", message: expect.any(String) });
    expect(res.body?.message).toMatch(/track name is already taken/i);
  });

  it("returns error if user does not have permissions to change it", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app)
      .patch(`/v1/tracks/23`)
      .send({ name: "nopermission" })
      .set("Authorization", `Bearer ${jwtToken}`)
      .expect(403);
    expect(res.body).toEqual({ statusCode: 403, error: "Forbidden", message: expect.any(String) });
    expect(res.body?.message).toMatch(/permission.*modify.*track/i);
  });

  it("returns error if track is not found", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app)
      .patch(`/v1/tracks/24`)
      .send({ name: "notfound" })
      .set("Authorization", `Bearer ${jwtToken}`)
      .expect(404);
    expect(res.body).toEqual({ statusCode: 404, error: "Not Found", message: expect.any(String) });
    expect(res.body?.message).toMatch(/track not found/i);
  });
});

describe("DELETE /v1/tracks/:id", () => {
  it("should enforce i32 id", async () => {
    await i32IdCheck(async (id: any) => {
      const jwtToken = await getLoginTokenAndTestResult(user_login, app);
      return request(app).delete(`/v1/tracks/${id}`).set("Authorization", `Bearer ${jwtToken}`);
    });
  });

  it("should soft delete track successfully, and be idempotent", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    let res = await request(app).delete(`/v1/tracks/51`).set("Authorization", `Bearer ${jwtToken}`).expect(200);
    res = await request(app).delete(`/v1/tracks/51`).set("Authorization", `Bearer ${jwtToken}`).expect(200);
    expect(res.body).toEqual({
      id: 51,
      name: "boysareback",
      created_at: expect.any(String),
      user_id: 1,
      duration: 4.392,
      updated_at: expect.any(String),
      deleted_at: expect.any(String),
      raw_total_play_count: 0,
      total_play_count: 0,
    });
  });

  it("returns error if user does not have permissions to change it", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app).delete(`/v1/tracks/23`).set("Authorization", `Bearer ${jwtToken}`).expect(403);
    expect(res.body).toEqual({ statusCode: 403, error: "Forbidden", message: expect.any(String) });
    expect(res.body?.message).toMatch(/permission.*modify.*track/i);
  });

  it("returns error if track is not found", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app).delete(`/v1/tracks/24`).set("Authorization", `Bearer ${jwtToken}`).expect(404);
    expect(res.body).toEqual({ statusCode: 404, error: "Not Found", message: expect.any(String) });
    expect(res.body?.message).toMatch(/track not found/i);
  });
});

describe("PATCH /v1/tracks/:id/restore", () => {
  it("should enforce i32 id", async () => {
    await i32IdCheck(async (id: any) => {
      const jwtToken = await getLoginTokenAndTestResult(user_login, app);
      return request(app).patch(`/v1/tracks/${id}/restore`).set("Authorization", `Bearer ${jwtToken}`);
    });
  });

  it("should restore track successfully, and be idempotent", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    let res = await request(app)
      .patch(`/v1/tracks/51/restore`)
      .send({})
      .set("Authorization", `Bearer ${jwtToken}`)
      .expect(200);
    res = await request(app)
      .patch(`/v1/tracks/51/restore`)
      .send({})
      .set("Authorization", `Bearer ${jwtToken}`)
      .expect(200);
    expect(res.body).toEqual({
      id: 51,
      name: "boysareback",
      created_at: expect.any(String),
      user_id: 1,
      duration: 4.392,
      updated_at: expect.any(String),
      deleted_at: null,
      raw_total_play_count: 0,
      total_play_count: 0,
    });
  });

  it("should restore with a name change", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    let res = await request(app).delete(`/v1/tracks/51`).set("Authorization", `Bearer ${jwtToken}`).expect(200);
    res = await request(app)
      .patch(`/v1/tracks/51/restore`)
      .send({ name: "boysarerestored" })
      .set("Authorization", `Bearer ${jwtToken}`)
      .expect(200);
    expect(res.body).toEqual({
      id: 51,
      name: "boysarerestored",
      created_at: expect.any(String),
      user_id: 1,
      duration: 4.392,
      updated_at: expect.any(String),
      deleted_at: null,
      raw_total_play_count: 0,
      total_play_count: 0,
    });
  });

  it("returns error if track name has upper-case letters", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    let res = await request(app).delete(`/v1/tracks/51`).set("Authorization", `Bearer ${jwtToken}`).expect(200);
    res = await request(app)
      .patch(`/v1/tracks/51/restore`)
      .send({ name: "Boysareback" })
      .set("Authorization", `Bearer ${jwtToken}`)
      .expect(400);
    expect(res.body).toEqual({ statusCode: 400, error: "Bad Request", message: expect.any(String) });
    expect(res.body?.message).toMatch(/validation error.*track name/i);
  });

  it("returns error if track name has special characters", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    let res = await request(app).delete(`/v1/tracks/51`).set("Authorization", `Bearer ${jwtToken}`).expect(200);
    res = await request(app)
      .patch(`/v1/tracks/51/restore`)
      .send({ name: "boysareback!" })
      .set("Authorization", `Bearer ${jwtToken}`)
      .expect(400);
    expect(res.body).toEqual({ statusCode: 400, error: "Bad Request", message: expect.any(String) });
    expect(res.body?.message).toMatch(/validation error.*track name/i);
  });

  it("returns error if track name has spaces", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    let res = await request(app).delete(`/v1/tracks/51`).set("Authorization", `Bearer ${jwtToken}`).expect(200);
    res = await request(app)
      .patch(`/v1/tracks/51/restore`)
      .send({ name: "boys are back" })
      .set("Authorization", `Bearer ${jwtToken}`)
      .expect(400);
    expect(res.body).toEqual({ statusCode: 400, error: "Bad Request", message: expect.any(String) });
    expect(res.body?.message).toMatch(/validation error.*track name/i);
  });

  it("returns error if track name is already taken", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    let res = await request(app).delete(`/v1/tracks/51`).set("Authorization", `Bearer ${jwtToken}`).expect(200);
    res = await request(app)
      .patch(`/v1/tracks/51/restore`)
      .send({ name: "happynewyear" })
      .set("Authorization", `Bearer ${jwtToken}`)
      .expect(409);
    expect(res.body).toEqual({ statusCode: 409, error: "Conflict", message: expect.any(String) });
    expect(res.body?.message).toMatch(/track name is already taken/i);
  });

  it("returns error if user does not have permissions to change it", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app)
      .patch(`/v1/tracks/23/restore`)
      .send({})
      .set("Authorization", `Bearer ${jwtToken}`)
      .expect(403);
    expect(res.body).toEqual({ statusCode: 403, error: "Forbidden", message: expect.any(String) });
    expect(res.body?.message).toMatch(/permission.*modify.*track/i);
  });

  it("returns error if track is not found", async () => {
    const jwtToken = await getLoginTokenAndTestResult(user_login, app);
    const res = await request(app)
      .patch(`/v1/tracks/24/restore`)
      .send({})
      .set("Authorization", `Bearer ${jwtToken}`)
      .expect(404);
    expect(res.body).toEqual({ statusCode: 404, error: "Not Found", message: expect.any(String) });
    expect(res.body?.message).toMatch(/track not found/i);
  });
});

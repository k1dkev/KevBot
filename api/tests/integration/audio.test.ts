import request from "supertest";
import fs from "fs";
import { mkdtemp, readFile, readdir, rm, writeFile } from "fs/promises";
import path from "path";
import { tmpdir } from "os";
import http from "http";
import { AddressInfo } from "net";
import { Transform } from "stream";
import { execFile } from "child_process";
import { promisify } from "util";
import { GenericContainer, StartedTestContainer, Wait } from "testcontainers";
import { Bucket, Storage } from "@google-cloud/storage";
import { appFactory } from "../../src/app";
import { configFactory, Config } from "../../src/config/config";
import { dbFactory, KevbotDb } from "../../src/db/connection";
import * as audioUtils from "../../src/utils/audioUtils";
import { fixturePath, getLoginTokenAndTestResult } from "../utils";
import { seedUsers } from "../seeds/seedUsers";

jest.setTimeout(30000);

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

async function eventually(assertion: () => Promise<void>) {
  const deadline = Date.now() + 5000;
  while (true) {
    try {
      await assertion();
      return;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
}

let db: KevbotDb;
let bucket: Bucket;
let gcs: StartedTestContainer;
let app: ReturnType<typeof appFactory>;
let config: Config;
let token: string;
let directory: string;
let server: http.Server;
let port: number;
let beforeLibrary: unknown;
let beforeObjects: string[];
const generated: Record<string, string> = {};
const requestDirectories = new Set<string>();

async function librarySnapshot() {
  const tables = [
    "tracks",
    "playlists",
    "playlist_tracks",
    "track_plays",
    "playlist_plays",
    "track_play_counts",
    "track_play_type_counts",
    "user_greetings",
    "user_farewells",
  ] as const;
  return Promise.all(tables.map((table) => db.selectFrom(table).selectAll().execute()));
}

beforeAll(async () => {
  // Report failed shared test infrastructure before starting more containers.
  expect(process.env.NODE_ENV).toBe("test");
  expect(process.env.DB_CONNECTION_STRING).toMatch(/^mysql:/);
  directory = await mkdtemp(path.join(tmpdir(), "kevbot-audio-tests-"));
  gcs = await new GenericContainer("fsouza/fake-gcs-server")
    .withExposedPorts(4443)
    .withCommand(["-scheme", "http"])
    .withWaitStrategy(Wait.forListeningPorts())
    .start();
  Object.assign(process.env, {
    GCP_API_ENDPOINT: `http://${gcs.getHost()}:${gcs.getMappedPort(4443)}`,
    GCP_TRACKS_BUCKET_NAME: "normalization-test-tracks",
    KEVBOT_API_ADDRESS: "127.0.0.1",
    KEVBOT_API_JWT_SECRET: "normalization-test-secret",
    KEVBOT_API_PORT: "3000",
    BOT_AUTH_API_KEY: "normalization-bot-key",
    DEV_ROUTES_ALLOWED: "true",
    DEV_AUTH_SECRET: "normalization-dev-secret",
    DISCORD_OAUTH2_REDIRECT_URI: "http://dummy.com",
    DISCORD_OAUTH2_CLIENT_ID: "dummy",
    DISCORD_OAUTH2_CLIENT_SECRET: "dummy",
  });
  const settings = configFactory();
  config = settings.config;
  db = dbFactory(settings.secrets.DB_CONNECTION_STRING);
  await seedUsers(db);
  const storage = new Storage({ projectId: "normalization-test", apiEndpoint: process.env.GCP_API_ENDPOINT });
  [bucket] = await storage.createBucket(process.env.GCP_TRACKS_BUCKET_NAME!);
  await bucket.file("existing-object.mp3").save(await readFile(fixturePath("boysareback.mp3")));
  app = appFactory(config, settings.secrets, db, bucket);
  token = await getLoginTokenAndTestResult({ user_id: 1 }, app);
  beforeLibrary = await librarySnapshot();
  beforeObjects = (await bucket.getFiles())[0].map((file) => file.name);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  port = (server.address() as AddressInfo).port;

  for (const [name, duration, format] of [
    ["below", "14.928", "mp3"],
    ["boundary", "14.976", "mp3"],
    ["above", "15.1", "mp3"],
    ["wav", "2", "wav"],
    ["silent", "2", "mp3"],
  ]) {
    generated[name] = path.join(directory, `${name}.${format}`);
    await promisify(execFile)("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      name === "silent" ? "anullsrc=r=48000:cl=mono" : "sine=frequency=440:sample_rate=48000",
      "-t",
      duration,
      "-y",
      generated[name],
    ]);
  }
}, 120000);

beforeEach(() => {
  const original = fs.promises.mkdtemp;
  jest.spyOn(fs.promises, "mkdtemp").mockImplementation(async (...args: Parameters<typeof original>) => {
    const result = await original(...args);
    if (String(args[0]).includes("kevbot-normalize-")) requestDirectories.add(String(result));
    return result;
  });
});

afterEach(async () => {
  jest.restoreAllMocks();
  await eventually(async () => {
    for (const filename of requestDirectories) expect(fs.existsSync(filename)).toBe(false);
  });
  if (db && bucket && beforeObjects) {
    expect(await librarySnapshot()).toEqual(beforeLibrary);
    expect((await bucket.getFiles())[0].map((file) => file.name)).toEqual(beforeObjects);
  }
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  if (db) await db.destroy();
  if (gcs) await gcs.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
});

function normalize() {
  return request(app).post("/v1/audio/normalize").set("Authorization", `Bearer ${token}`);
}

async function assertAudio(buffer: Buffer, input: string) {
  expect(Buffer.isBuffer(buffer)).toBe(true);
  const output = path.join(directory, "download.mp3");
  await writeFile(output, buffer);
  const metadata = await audioUtils.getTrackMetaData(output);
  expect(metadata.format.format_name).toBe("mp3");
  expect(metadata.streams.some((stream) => stream.codec_name === "mp3")).toBe(true);
  const original = await audioUtils.getTrackMetaData(input);
  expect(Math.abs(metadata.format.duration! - original.format.duration!)).toBeLessThanOrEqual(
    config.acceptableDurationChangeInSeconds,
  );
  await audioUtils.verifyLoudnessNormalization(output, config.acceptableIntegratedLoudnessBand);
}

it("returns verified playable MP3 bytes and download headers without library metadata or persistent changes", async () => {
  const response = await normalize().attach("file", fixturePath("boysareback.mp3")).expect(200);
  expect(response.headers["content-type"]).toBe("audio/mpeg");
  expect(response.headers["content-disposition"]).toBe('attachment; filename="boysareback-normalized.mp3"');
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(Number(response.headers["content-length"])).toBe(response.body.length);
  await assertAudio(response.body, fixturePath("boysareback.mp3"));
});

it.each([undefined, "invalid-token"])("authenticates before parsing uploads (%s)", async (authorization) => {
  const metadata = jest.spyOn(audioUtils, "getTrackMetaData");
  const attempt = request(app).post("/v1/audio/normalize");
  if (authorization) attempt.set("Authorization", `Bearer ${authorization}`);
  const response = await attempt.attach("file", Buffer.from("rejected before parsing"), "clip.mp3").expect(401);
  expect(response.body).toMatchObject({ statusCode: 401, error: "Unauthorized" });
  expect(metadata).not.toHaveBeenCalled();
});

it("sanitizes filenames and always returns an MP3 extension", async () => {
  const response = await normalize()
    .attach("file", fixturePath("boysareback.mp3"), { filename: "../../evil;bad name.mp3" })
    .expect(200);
  expect(response.headers["content-disposition"]).toBe('attachment; filename="evil_bad_name-normalized.mp3"');
});

it.each([
  ["missing file", undefined, /file is required/i],
  ["unsupported extension", "notanmp3.txt", /invalid file extension/i],
  ["corrupt MP3", "fakemp3.mp3", /unsupported or corrupt/i],
])("rejects %s", async (_name, filename, message) => {
  const attempt = normalize();
  if (filename) attempt.attach("file", fixturePath(filename));
  const response = await attempt.expect(400);
  expect(response.body).toMatchObject({
    statusCode: 400,
    error: "Bad Request",
    message: expect.stringMatching(message),
  });
});

it("rejects non-MP3 content disguised with an MP3 name and MIME type", async () => {
  const response = await normalize()
    .attach("file", generated.wav, { filename: "fake.mp3", contentType: "audio/mpeg" })
    .expect(400);
  expect(response.body.message).toMatch(/invalid file format/i);
});

it("rejects an oversized file with consistent HTTP and JSON status 413", async () => {
  const response = await normalize()
    .attach("file", Buffer.alloc(config.maxFileSizeInBytes + 1), "large.mp3")
    .expect(413);
  expect(response.body).toMatchObject({
    statusCode: 413,
    error: "Request Entity Too Large",
    message: expect.stringMatching(/3.0MB/),
  });
});

it.each(["wrong field", "extra file", "extra metadata", "broken multipart"])("rejects %s", async (scenario) => {
  const attempt = normalize();
  if (scenario === "broken multipart") attempt.set("Content-Type", "multipart/form-data").send("bad");
  else if (scenario === "wrong field") attempt.attach("audio", Buffer.from("wrong field"), "clip.mp3");
  else {
    attempt.attach("file", fs.readFileSync(fixturePath("boysareback.mp3")), "clip.mp3");
    if (scenario === "extra file") attempt.attach("file", Buffer.from("extra file"), "extra.mp3");
    else attempt.field("name", "unused");
  }
  const response = await attempt.expect(400);
  expect(response.body).toMatchObject({ statusCode: 400, error: "Bad Request" });
});

it("accepts real audio below 15 seconds and rejects real audio at and above 15 seconds", async () => {
  expect((await audioUtils.getTrackMetaData(generated.below)).format.duration).toBeLessThan(15);
  expect((await audioUtils.getTrackMetaData(generated.boundary)).format.duration).toBe(15);
  expect((await audioUtils.getTrackMetaData(generated.above)).format.duration).toBeGreaterThan(15);
  const response = await normalize().attach("file", generated.below).expect(200);
  await assertAudio(response.body, generated.below);
  for (const filename of [generated.boundary, generated.above]) {
    const rejected = await normalize().attach("file", filename).expect(400);
    expect(rejected.body.message).toMatch(/less than 15 seconds/i);
  }
  const libraryUpload = await request(app)
    .post("/v1/tracks")
    .set("Authorization", `Bearer ${token}`)
    .field("name", "boundary")
    .attach("file", generated.boundary)
    .expect(400);
  expect(libraryUpload.body.message).toMatch(/less than 15 seconds/i);
});

it("does not return audio when normalization cannot handle a silent input", async () => {
  await normalize().attach("file", generated.silent).expect(500);
});

it("cleans a partially written output after a normalization failure", async () => {
  jest.spyOn(audioUtils, "loudnessNormalize").mockImplementationOnce(async (_input, output) => {
    await writeFile(output, "partial MP3");
    throw new Error("synthetic FFmpeg failure");
  });
  const response = await normalize().attach("file", fixturePath("boysareback.mp3")).expect(500);
  expect(response.body).toEqual({
    statusCode: 500,
    error: "Internal Server Error",
    message: "An internal server error occurred",
  });
});

it("rejects real output that fails duration preservation", async () => {
  const normalizeAudio = audioUtils.loudnessNormalize;
  jest.spyOn(audioUtils, "loudnessNormalize").mockImplementationOnce(async (input, output, signal) => {
    await normalizeAudio(input, output, signal);
    // Substitute real audio of a different length, rather than faking a metadata result.
    await fs.promises.copyFile(generated.below, output);
  });
  await normalize().attach("file", fixturePath("boysareback.mp3")).expect(500);
});

it("rejects real unnormalized output even when duration is preserved", async () => {
  jest.spyOn(audioUtils, "loudnessNormalize").mockImplementationOnce(async (input, output) => {
    await fs.promises.copyFile(input, output);
  });
  await normalize().attach("file", fixturePath("boysareback.mp3")).expect(500);
});

it("isolates concurrent requests using the same original filename", async () => {
  const before = new Set(requestDirectories);
  const responses = await Promise.all([
    normalize().attach("file", fixturePath("boysareback.mp3"), "same.mp3"),
    normalize().attach("file", generated.below, "same.mp3"),
    normalize().attach("file", fixturePath("fakemp3.mp3"), "same.mp3"),
  ]);
  expect(responses.map((response) => response.status)).toEqual([200, 200, 400]);
  expect([...requestDirectories].filter((filename) => !before.has(filename))).toHaveLength(3);
  await assertAudio(responses[0].body, fixturePath("boysareback.mp3"));
  await assertAudio(responses[1].body, generated.below);
});

function rawUpload(filename = fixturePath("boysareback.mp3")) {
  const boundary = "normalization-test-boundary";
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="clip.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n`,
    ),
    fs.readFileSync(filename),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const attempt = http.request({
    host: "127.0.0.1",
    port,
    path: "/v1/audio/normalize",
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": body.length,
    },
  });
  // ECONNRESET is the expected outcome of deliberately disconnecting the client.
  attempt.on("error", () => {});
  return { attempt, body };
}

it("releases a partially received upload on disconnect without creating processing files", async () => {
  const metadata = jest.spyOn(audioUtils, "getTrackMetaData");
  const { attempt, body } = rawUpload();
  attempt.write(body.subarray(0, body.length - 64));
  await new Promise((resolve) => setTimeout(resolve, 100));
  attempt.destroy();
  await new Promise((resolve) => attempt.once("close", resolve));
  expect(metadata).not.toHaveBeenCalled();
});

it("cancels real FFmpeg processing on disconnect and removes its files after it stops", async () => {
  const started = deferred();
  const aborted = deferred();
  const normalizeAudio = audioUtils.loudnessNormalize;
  jest.spyOn(audioUtils, "loudnessNormalize").mockImplementationOnce((input, output, signal) => {
    signal!.addEventListener("abort", () => aborted.resolve(), { once: true });
    const processing = normalizeAudio(input, output, signal);
    started.resolve();
    return processing;
  });
  const { attempt, body } = rawUpload(generated.below);
  attempt.end(body);
  await started.promise;
  attempt.destroy();
  await aborted.promise;
});

it.each([false, true])("keeps files until streaming finishes or the client disconnects (abort=%s)", async (abort) => {
  const createReadStream = fs.createReadStream;
  const streaming = deferred<string>();
  const received = deferred();
  let release: (() => void) | undefined;
  jest.spyOn(fs, "createReadStream").mockImplementationOnce((filename) => {
    const source = createReadStream(filename);
    const gate = new Transform({
      transform(chunk, _encoding, callback) {
        this.push(chunk);
        if (release) callback();
        else {
          release = () => callback();
          streaming.resolve(path.dirname(String(filename)));
        }
      },
    });
    gate.once("close", () => source.destroy());
    source.pipe(gate);
    return gate as unknown as fs.ReadStream;
  });
  const { attempt, body } = rawUpload();
  const finished = deferred();
  attempt.on("response", (response) => {
    response.on("error", () => {});
    response.once("data", () => received.resolve());
    response.once("end", () => finished.resolve());
    response.once("close", () => finished.resolve());
  });
  attempt.end(body);
  const processingDirectory = await streaming.promise;
  expect((await readdir(processingDirectory)).sort()).toEqual(["input", "normalized.mp3"]);
  await received.promise;
  if (abort) attempt.destroy();
  else release!();
  await finished.promise;
});

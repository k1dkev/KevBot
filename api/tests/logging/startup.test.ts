import { spawnSync } from "node:child_process";
import path from "node:path";
import { capture } from "./capture";

test.each([
  ["authAccessTokenTtlMinutes", { AUTH_ACCESS_TOKEN_TTL_MINUTES: "startup-secret-canary" }],
  ["logLevel", { LOG_LEVEL: "startup-secret-canary" }],
  ["DISCORD_OAUTH2_REDIRECT_URI", { DISCORD_OAUTH2_REDIRECT_URI: "invalid-startup-secret-canary" }],
])("compiled startup exits 1 without echoing invalid %s", (field, invalid) => {
  const secret = "startup-secret-canary";
  const result = spawnSync(process.execPath, [path.resolve(__dirname, "../../dist/server.js")], {
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "production",
      LOG_LEVEL: "info",
      DB_CONNECTION_STRING: `mysql://user:${secret}@127.0.0.1/db`,
      GCP_API_ENDPOINT: "http://127.0.0.1:4443",
      GCP_TRACKS_BUCKET_NAME: "synthetic",
      KEVBOT_API_ADDRESS: "127.0.0.1",
      KEVBOT_API_PORT: "3000",
      KEVBOT_API_JWT_SECRET: secret,
      BOT_AUTH_API_KEY: secret,
      DISCORD_OAUTH2_CLIENT_ID: "synthetic",
      DISCORD_OAUTH2_CLIENT_SECRET: secret,
      DISCORD_OAUTH2_REDIRECT_URI: "http://localhost/callback",
      ...invalid,
    },
    encoding: "utf8",
    timeout: 10000,
  });
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stdout).toContain("config.validation.failed");
  expect(result.stdout + result.stderr).not.toContain(secret);
  const record = JSON.parse(result.stdout.trim());
  expect(record.level).toBe(60);
  expect(record.issues.some((issue: { field: string }) => issue.field === field)).toBe(true);
  expect(record.issues.every((issue: object) => Object.keys(issue).length === 2)).toBe(true);
});

test("startup dependency failure retains exit 1 and emits one sanitized fatal log", async () => {
  const { log, records } = capture();
  const exit = jest.spyOn(process, "exit").mockImplementation(() => undefined as never);
  jest.doMock("../../src/logging/logger", () => ({ logger: log }));
  jest.doMock("../../src/config/config", () => ({ configFactory: () => ({ config: {}, secrets: {} }) }));
  jest.doMock("../../src/db/connection", () => ({ dbFactory: () => ({}) }));
  jest.doMock("../../src/storage/tracksBucket", () => ({ tracksBucketFactory: () => ({}) }));
  jest.doMock("../../src/schedulers/taskScheduler", () => ({
    __esModule: true,
    default: async () => {
      throw new Error("database check failed token=startup-canary");
    },
  }));
  try {
    jest.isolateModules(() => {
      require("../../src/server");
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(exit).toHaveBeenCalledWith(1);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ level: 60, component: "startup", msg: "server.start.failed" });
    expect(JSON.stringify(records)).not.toContain("startup-canary");
  } finally {
    exit.mockRestore();
  }
});

import { capture } from "./capture";
import { adaptLogger, AppLogger, environmentSecretValues, parseLogLevel, sanitize } from "../../src/logging/safety";
import { getLogger, logContext, withJobLogger } from "../../src/logging/context";

test("Pino filters levels and preserves timestamp, service and child context", () => {
  const { log, records } = capture("warn");
  const child = log.child({ component: "test", requestId: "local-request" });
  child.info({}, "hidden");
  child.warn({ count: 2 }, "visible");
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    level: 40,
    service: "api",
    component: "test",
    requestId: "local-request",
    count: 2,
    msg: "visible",
  });
  expect(new Date(records[0].time).toISOString()).toBe(records[0].time);
  const silent = capture("silent");
  silent.log.fatal({}, "hidden");
  expect(silent.records).toEqual([]);
  expect(parseLogLevel(undefined, "info")).toBe("info");
  expect(() => parseLogLevel("secret-invalid-level", "info")).toThrow(/^LOG_LEVEL must be/);
});

test("redaction covers nested keys, strings, URLs, encodings, error causes and child bindings", () => {
  process.env.KEVBOT_API_JWT_SECRET = "known-secret-in-prose";
  const { log, records } = capture();
  const cause = Object.assign(new Error("mysql://root:db-canary@db/kevbot"), { sql: "private-sql-canary" });
  const err = new Error("failed https://example.test/callback?code=oauth-canary#state=state-canary", { cause });
  const cycle: Record<string, unknown> = { keep: 7 };
  cycle.self = cycle;
  const fields = {
    err,
    cycle,
    bytes: new Uint8Array([1, 2]),
    nested: [
      {
        Authorization: "header-canary",
        refresh_token: "refresh-canary",
        "x-bot-key": "bot-canary",
        body: "body-canary",
      },
    ],
    encoded: "https%3A%2F%2Fx.test%2Fcallback%3Fcode%3Dencoded-canary",
    relative: "/callback?unexpected=query-canary",
    credentials: "password='spaced secret-canary value'",
    bearer: "Bearer bearer-canary",
    jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature-canary",
    raw: "known-secret-in-prose",
  };
  log.child({ cookie: "cookie-canary" }).error(fields, "failure token=event-canary");
  const output = JSON.stringify(records);
  expect(output).not.toMatch(/canary|known-secret-in-prose/);
  expect(records[0].err.type).toBe("Error");
  expect(records[0].err.stack).toContain("logger.test.ts");
  expect(records[0].err.cause.type).toBe("Error");
  expect(records[0].cycle).toEqual({ keep: 7, self: "[CIRCULAR]" });
  expect(fields.nested[0].Authorization).toBe("header-canary");
  delete process.env.KEVBOT_API_JWT_SECRET;
});

test("logging and hostile getters cannot break operations", () => {
  const { log } = capture();
  expect(() =>
    log.error(
      {
        get value() {
          throw new Error("getter");
        },
      },
      "event",
    ),
  ).not.toThrow();
  const failed = adaptLogger({
    info() {
      throw new Error("closed sink");
    },
    child() {
      throw new Error("child");
    },
  } as unknown as AppLogger);
  expect(() => failed.info({}, "event")).not.toThrow();
  expect(() => failed.child({}).info({}, "event")).not.toThrow();
});

test("async job context isolates concurrent jobs and returns the operation result", async () => {
  const { log, records } = capture();
  await logContext.run(log, () =>
    Promise.all(
      [1, 2].map(async (value) =>
        withJobLogger("testJob", async () => {
          await new Promise((resolve) => setTimeout(resolve, 2));
          getLogger().info({ value }, "job.done");
          return value;
        }),
      ),
    ),
  );
  expect(records.map((record) => record.value)).toEqual([1, 2]);
  expect(new Set(records.map((record) => record.jobId)).size).toBe(2);
  expect(records.every((record) => record.job === "testJob")).toBe(true);
});

test("environment/config dumps are redacted", () => {
  expect(sanitize({ ENV: { PRIVATE: "canary" }, config: "canary" })).toEqual({
    ENV: "[REDACTED]",
    config: "[REDACTED]",
  });
});

test("connection passwords and token query values are also removed from unlabelled error prose", () => {
  const secrets = environmentSecretValues({
    DB_CONNECTION_STRING: "mysql://user:p%40ss-canary@localhost/db?password=query-canary",
    NORMAL_SETTING: "normal",
  });
  expect(sanitize(new Error("failed for p@ss-canary and query-canary"), secrets)).toMatchObject({
    message: "failed for [REDACTED] and [REDACTED]",
  });
  expect(secrets).not.toContain("normal");
});

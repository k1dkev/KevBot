import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(name, imports = {}, env = {}) {
  const source = readFileSync(new URL(name, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  const loaded = { exports: {} };
  new Function("require", "module", "exports", "process", outputText)(
    (name) => imports[name] ?? require(name),
    loaded,
    loaded.exports,
    { env },
  );
  return loaded.exports;
}
const safety = load("./safety.ts");

test("Next Node instrumentation uses route templates and server-generated correlation", async () => {
  const lines = [];
  const fakePino = Object.assign(
    () => {
      const sink = (bindings = {}) => ({
        info: (fields, event) => lines.push({ ...bindings, ...fields, event }),
        error: (fields, event) => lines.push({ ...bindings, ...fields, event }),
        child: (fields) => sink({ ...bindings, ...fields }),
      });
      return sink();
    },
    { destination: () => ({ on() {} }), stdTimeFunctions: { isoTime() {} } },
  );
  const server = load(
    "./server.ts",
    { "./safety": safety, "server-only": {}, pino: fakePino },
    {
      NODE_ENV: "production",
      PRIVATE_API_KEY: "known-server-canary",
    },
  );
  const instrumentation = load(
    "../../instrumentation.ts",
    { "./lib/logging/server": server },
    { NEXT_RUNTIME: "nodejs" },
  );
  await instrumentation.register();
  await instrumentation.onRequestError(
    new Error("known-server-canary /path?code=query-canary"),
    {
      method: "GET",
      path: "/path?code=path-canary",
      headers: { cookie: "header-canary" },
    },
    { routePath: "/user/[id]" },
  );
  assert.equal(lines.length, 2);
  assert.equal(lines[1].route, "/user/[id]");
  assert.match(lines[1].requestId, /^[\da-f-]{36}$/);
  assert.equal(lines[1].event, "server.request.failed");
  assert.doesNotMatch(JSON.stringify(lines), /canary/);
});

test("portable policy stays identical across independently packaged services", () => {
  assert.equal(
    readFileSync(new URL("./safety.ts", import.meta.url), "utf8"),
    readFileSync(new URL("../../../../api/src/logging/safety.ts", import.meta.url), "utf8"),
  );
});

test("browser uses Pino's explicit browser entry, safe production defaults and no server env", () => {
  const lines = [];
  const original = console.warn;
  console.warn = (line) => lines.push(line);
  try {
    const browser = load("./browser.ts", { "./safety": safety }, { NODE_ENV: "production", LOG_LEVEL: "trace" });
    browser.logger.info({}, "hidden");
    browser.logger
      .child({ component: "auth", cookie: "cookie-canary" })
      .warn({ err: new Error("/callback?code=oauth-canary"), nested: { accessToken: "token-canary" } }, "auth.failed");
    assert.equal(lines.length, 1);
    assert.equal(lines[0].service, "frontend");
    assert.equal(lines[0].component, "auth");
    assert.equal(lines[0].level, 40);
    assert.equal(typeof lines[0].time, "number");
    assert.equal(lines[0].msg, "auth.failed");
    assert.equal(lines[0].err.type, "Error");
    assert.doesNotMatch(JSON.stringify(lines), /canary/);
    const source = readFileSync(new URL("./browser.ts", import.meta.url), "utf8");
    assert.match(source, /from "pino\/browser"/);
    assert.doesNotMatch(source, /NEXT_PUBLIC_|LOG_LEVEL|transmit\s*:|fetch\(|node:|\.\/server/);
    const pinoSource = readFileSync(require.resolve("pino/browser"), "utf8");
    assert.doesNotMatch(pinoSource, /require\(['"](?:node:|sonic-boom|thread-stream|fs|os|worker_threads)/);
    assert.match(readFileSync(new URL("./server.ts", import.meta.url), "utf8"), /import "server-only"/);
  } finally {
    console.warn = original;
  }
});

test("browser sanitization handles encoded embedded secrets, opaque objects and cycles", () => {
  const circular = { password: "password-canary" };
  circular.self = circular;
  const value = safety.sanitize({
    circular,
    headers: new Headers({ Authorization: "canary" }),
    err: new Error('response {"client_secret":"spaced canary value"}'),
    url: "/callback?unusual=canary#secret",
    encoded: "invalid% code%253Dencoded-canary",
  });
  assert.doesNotMatch(JSON.stringify(value), /canary/);
  assert.equal(value.circular.self, "[CIRCULAR]");
  assert.equal(value.err.type, "Error");
  assert.equal(safety.parseLogLevel(undefined, "warn"), "warn");
  assert.throws(() => safety.parseLogLevel("invalid-canary", "warn"), /^Error: LOG_LEVEL must be/);
});

test("SQL-bearing errors and nested wrapper prose fail closed in the portable adapter", () => {
  const driver = Object.assign(new Error("Duplicate entry sql-canary"), {
    code: "ER_DUP_ENTRY",
    sql: "SELECT 'sql-canary'",
    sqlMessage: "sql-canary",
    properties: { detail: "sql-canary" },
  });
  const value = safety.sanitize({ nested: [{ err: new Error("query sql-canary", { cause: driver }) }] });
  const err = value.nested[0].err;
  assert.equal(err.message, "Database error details omitted");
  assert.equal(err.stack, "[REDACTED]");
  assert.equal(err.cause.type, "Error");
  assert.equal(err.cause.errorCode, "ER_DUP_ENTRY");
  assert.doesNotMatch(JSON.stringify(value), /canary/);
});

test(
  "compiled browser chunks contain no Node logger implementation",
  { skip: !process.env.CHECK_LOGGING_BUNDLE },
  () => {
    const chunks = new URL("../../../.next/static/chunks/", import.meta.url);
    const files = readdirSync(chunks, { recursive: true }).filter((name) => name.endsWith(".js"));
    assert.ok(files.length > 0);
    for (const name of files) {
      assert.doesNotMatch(
        readFileSync(new URL(name, chunks), "utf8"),
        /sonic-boom|thread-stream|pino-worker|node:async_hooks/,
      );
    }
  },
);

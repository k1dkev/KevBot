import assert from "node:assert/strict";
import { test } from "node:test";
import { EventEmitter } from "node:events";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { Events, GatewayIntentBits, Partials } from "discord.js";
import { readConfig, ConfigError } from "../dist/config.js";
import { createDiscordClient, startGateway } from "../dist/gateway.js";
import { createLogger } from "../dist/logging.js";
import { config, logs, message } from "./helpers.mjs";

test("config validates fields, URL/level/bounds, ignores unknown env, and never includes secret values in failures", () => {
  for (const overrides of [
    { DISCORD_BOT_TOKEN: "" },
    { COMMAND_PREFIX: " " },
    { API_BASE_URL: "file:///private" },
    { API_BASE_URL: "https://user:secret@api.test" },
    { API_BASE_URL: "https://api.test/?token=secret" },
    { LOG_LEVEL: "secret-canary" },
    { API_REQUEST_TIMEOUT_MS: "Infinity" },
    { API_MAX_CONCURRENT_REQUESTS: "0" },
  ])
    assert.throws(() => config(overrides), ConfigError);
  const cfg = readConfig({
    DISCORD_BOT_TOKEN: "synthetic",
    BOT_AUTH_API_KEY: "synthetic-key",
    API_BASE_URL: "https://api.test",
    UNRELATED_PRIVATE_VALUE: "must-not-be-copied",
  });
  assert.equal(cfg.UNRELATED_PRIVATE_VALUE, undefined);
  assert.doesNotMatch(JSON.stringify(cfg), /must-not-be-copied/);
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
  assert.equal(manifest.dependencies["discord.js"], "14.27.0");
  assert.doesNotMatch(JSON.stringify(manifest.dependencies), /mysql|kysely|google-cloud|storage/);
});

test("metadata-only Pino adapter drops raw errors/SQL/prose and redacts tokens without breaking calls", () => {
  const records = [];
  const cfg = config({ LOG_LEVEL: "info" });
  const log = createLogger(cfg, { write: (line) => records.push(JSON.parse(line)) });
  log.debug({}, "hidden");
  log.child({ component: "commands" }).warn(
    {
      command: "help",
      reason: cfg.DISCORD_BOT_TOKEN,
      err: new Error("raw-canary"),
      body: "body-canary",
      sql: "sql-canary",
    },
    "reply.failed",
  );
  assert.equal(records.length, 1);
  assert.equal(records[0].service, "bot");
  assert.equal(records[0].component, "commands");
  assert.doesNotMatch(JSON.stringify(records), /canary|synthetic-discord-token/);
  const failed = createLogger(cfg, {
    write() {
      throw new Error("closed sink");
    },
  });
  assert.doesNotThrow(() => failed.error({}, "test.failed"));
});

test("offline help/config CLI cannot log in and does not print configuration secrets", () => {
  const invoke = (args, env = {}) =>
    spawnSync(process.execPath, ["--require", "./tests/no-network.cjs", "dist/main.js", ...args], {
      cwd: new URL("..", import.meta.url),
      env: { PATH: process.env.PATH, ...env },
      encoding: "utf8",
      timeout: 5000,
    });
  const help = invoke(["--help"]);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Only help is implemented/);
  const valid = invoke(["--check-config"], {
    DISCORD_BOT_TOKEN: "synthetic-canary",
    BOT_AUTH_API_KEY: "api-canary",
    API_BASE_URL: "https://api.test",
  });
  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stdout, /no login attempted/);
  assert.doesNotMatch(valid.stdout + valid.stderr, /canary/);
  const invalid = invoke(["--check-config"], { LOG_LEVEL: "level-canary" });
  assert.equal(invalid.status, 1);
  assert.doesNotMatch(invalid.stdout + invalid.stderr, /canary/);
});

class StubGateway extends EventEmitter {
  logins = 0;
  destroys = 0;
  async login(token) {
    this.logins++;
    assert.equal(token, "synthetic-discord-token");
    this.emit(Events.ClientReady);
    return token;
  }
  async destroy() {
    this.destroys++;
  }
}
test("gateway uses minimal prefix/DM intents, no voice intent, and gateway stubs dispatch help", async () => {
  const cfg = config();
  const actual = createDiscordClient(cfg);
  assert.ok(actual.options.intents.has(GatewayIntentBits.MessageContent));
  assert.ok(actual.options.intents.has(GatewayIntentBits.DirectMessages));
  assert.equal(actual.options.intents.has(GatewayIntentBits.GuildVoiceStates), false);
  assert.ok(actual.options.partials.includes(Partials.Channel));
  assert.equal(actual.options.rest.retries, 0);
  await actual.destroy();
  const client = new StubGateway();
  const { log } = logs();
  let apiClosed = 0;
  const runtime = await startGateway(cfg, log, {
    client,
    api: {
      close() {
        apiClosed++;
      },
    },
  });
  const event = message("kbHELP!KB", { guildId: null });
  client.emit(Events.MessageCreate, event.event);
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(event.dms.length > 0);
  client.emit(Events.Error, new Error("token-canary"));
  client.emit(Events.ShardError, new Error("token-canary"));
  await Promise.all([runtime.stop(), runtime.stop()]);
  assert.equal(client.logins, 1);
  assert.equal(client.destroys, 1);
  assert.equal(apiClosed, 1);
  assert.equal(client.listenerCount(Events.MessageCreate), 0);
});

test("failed/hanging login cleans listeners/resources, and invalidated sessions stop", async () => {
  for (const mode of ["failed", "hanging"]) {
    const client = new StubGateway();
    const { log } = logs();
    let closed = 0;
    client.login =
      mode === "failed"
        ? async () => {
            throw new Error("token-canary");
          }
        : () => new Promise(() => {});
    await assert.rejects(
      startGateway(config(), log, {
        client,
        api: {
          close() {
            closed++;
          },
        },
      }),
      /login failed or timed out/,
    );
    assert.equal(client.destroys, 1);
    assert.equal(closed, 1);
    assert.equal(client.listenerCount(Events.MessageCreate), 0);
  }
  const client = new StubGateway();
  const { log } = logs();
  let fatal = 0;
  const runtime = await startGateway(config(), log, { client, api: { close() {} }, onFatal: () => fatal++ });
  client.emit(Events.Invalidated);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fatal, 1);
  assert.equal(client.destroys, 1);
  await runtime.stop();
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { BotApiClient, ApiClientError, apiUserMessage } from "../dist/api-client.js";
import { actorId, otherActorId, config, logs, grant, json, serviceGrant } from "./helpers.mjs";
const schema = z.object({ ok: z.literal(true) });
const path = (url) => new URL(url).pathname;
function fixture(resource = async () => json({ ok: true }), overrides = {}) {
  const calls = [];
  const { log, records } = logs();
  const client = new BotApiClient(config(overrides), log, async (url, init) => {
    calls.push({ path: path(url), ...init });
    if (path(url) === "/v1/bot/auth") return json(serviceGrant());
    if (path(url) === "/v1/bot/actors/resolve") return json(grant("actor-token", JSON.parse(init.body).discord_id));
    return resource(url, init);
  });
  return { client, calls, records };
}

test("service key is used only for authentication; actor ID is a string-only strict body; ordinary calls use actor JWT", async () => {
  const { client, calls } = fixture();
  await client.request(actorId, "/v1/users/me", { schema });
  assert.deepEqual(
    calls.map((call) => call.path),
    ["/v1/bot/auth", "/v1/bot/actors/resolve", "/v1/users/me"],
  );
  assert.equal(calls[0].headers["x-bot-key"], "synthetic-api-key");
  assert.equal(calls[1].headers.Authorization, "Bearer service-token");
  assert.deepEqual(JSON.parse(calls[1].body), { discord_id: actorId });
  assert.equal(calls[2].headers.Authorization, "Bearer actor-token");
  assert.equal(calls[2].headers["x-bot-key"], undefined);
  assert.ok(calls.every((call) => call.redirect === "error" && call.signal));
  for (const id of ["0", "123", 1234567890123456789])
    await assert.rejects(client.request(id, "/v1/users/me", { schema }), { kind: "invalid" });
  for (const route of ["https://remote.test", "/v1/bot/actors/resolve", "/v1/../bot/auth", "/v1/users?token=secret"])
    await assert.rejects(client.request(actorId, route, { schema }), { kind: "invalid" });
  assert.equal(calls.length, 3);
  client.close();
});

test("concurrent requests share service authentication and actor resolution; cache keys never cross actors", async () => {
  const { client, calls } = fixture();
  await Promise.all(Array.from({ length: 5 }, () => client.request(actorId, "/v1/users/me", { schema })));
  await client.request(otherActorId, "/v1/users/me", { schema });
  assert.equal(calls.filter((call) => call.path === "/v1/bot/auth").length, 1);
  assert.deepEqual(
    calls.filter((call) => call.path.endsWith("resolve")).map((call) => JSON.parse(call.body).discord_id),
    [actorId, otherActorId],
  );
  client.close();
});

test("concurrent service 401s coordinate one renewal and retry resolution once", async () => {
  let service = 0,
    resolutions = 0;
  const { log } = logs();
  const client = new BotApiClient(config(), log, async (url, init) => {
    if (path(url).endsWith("/auth")) return json(serviceGrant(`service-${++service}`));
    if (path(url).endsWith("/resolve")) {
      resolutions++;
      if (init.headers.Authorization === "Bearer service-1") {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return json({}, 401);
      }
      return json(grant("actor", JSON.parse(init.body).discord_id));
    }
    return json({ ok: true });
  });
  await Promise.all([actorId, otherActorId].map((id) => client.request(id, "/v1/users/me", { schema })));
  assert.equal(service, 2);
  assert.equal(resolutions, 4);
  client.close();
});

test("concurrent rejected actor JWTs coordinate one renewal; mutations replay only explicit 401", async () => {
  let actors = 0,
    attempts = 0;
  const { log } = logs();
  const client = new BotApiClient(config({ API_MAX_CONCURRENT_REQUESTS: "16" }), log, async (url, init) => {
    if (path(url).endsWith("/auth")) return json(serviceGrant());
    if (path(url).endsWith("/resolve")) return json(grant(`actor-${++actors}`));
    attempts++;
    if (init.headers.Authorization === "Bearer actor-1") {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return json({}, 401);
    }
    return json({ ok: true });
  });
  await Promise.all(
    Array.from({ length: 4 }, () =>
      client.request(actorId, "/v1/playlists", { method: "POST", json: { name: "example" }, schema }),
    ),
  );
  assert.equal(actors, 2);
  assert.equal(attempts, 8);
  client.close();
});

test("a second auth rejection ends the operation; bad/mismatched actor grants fail closed", async () => {
  const rejected = fixture(async () => json({}, 401));
  await assert.rejects(rejected.client.request(actorId, "/v1/users/me", { schema }), { kind: "auth" });
  assert.equal(rejected.calls.filter((call) => call.path === "/v1/users/me").length, 2);
  rejected.client.close();
  for (const body of [
    grant("token", otherActorId),
    { ...grant(), user: { id: 0, discord_id: actorId } },
    { ...grant(), role: "user" },
  ]) {
    const { log } = logs();
    let ordinary = 0;
    const client = new BotApiClient(config(), log, async (url) => {
      if (path(url).endsWith("/auth")) return json(serviceGrant());
      if (path(url).endsWith("/resolve")) return json(body);
      ordinary++;
      return json({ ok: true });
    });
    await assert.rejects(client.request(actorId, "/v1/users/me", { schema }), { kind: "auth" });
    assert.equal(ordinary, 0);
    client.close();
  }
});

test("expiry and bounded LRU eviction re-resolve actors without retaining a library cache", async () => {
  let now = 0,
    count = 0;
  const { log } = logs();
  const client = new BotApiClient(
    config({ ACTOR_CACHE_MAX: "1" }),
    log,
    async (url, init) => {
      if (path(url).endsWith("/auth")) return json(serviceGrant());
      if (path(url).endsWith("/resolve")) {
        count++;
        return json(grant(`actor-${count}`, JSON.parse(init.body).discord_id, 1));
      }
      return json({ ok: true });
    },
    () => now,
  );
  await client.request(actorId, "/v1/users/me", { schema });
  now = 1000;
  await client.request(actorId, "/v1/users/me", { schema });
  await client.request(otherActorId, "/v1/users/me", { schema });
  await client.request(actorId, "/v1/users/me", { schema });
  assert.equal(count, 4);
  client.close();
});

for (const mode of ["network", "timeout", "server", "invalid_json", "oversized"]) {
  test(`unknown mutation outcome ${mode} never blindly retries and exposes no remote prose`, async () => {
    let attempts = 0;
    const { client, records } = fixture(async () => {
      attempts++;
      if (mode === "network") throw new Error("private-api-response-canary");
      if (mode === "timeout") return new Promise(() => {});
      if (mode === "server") return json({ message: "private-api-response-canary" }, 500);
      if (mode === "invalid_json") return new Response("private-api-response-canary");
      return new Response("x".repeat(1048577));
    });
    await assert.rejects(
      client.request(actorId, "/v1/playlists", { method: "POST", json: { name: "sample" }, schema }),
      (error) => {
        assert.ok(error instanceof ApiClientError);
        assert.equal(error.outcomeUnknown, true);
        assert.match(apiUserMessage(error), /not automatically retried/);
        return true;
      },
    );
    assert.equal(attempts, 1);
    assert.doesNotMatch(JSON.stringify(records), /canary/);
    client.close();
  });
}

test("bounds cover delayed response bodies, fail-fast concurrency, shutdown and useful explicit errors", async () => {
  for (const [status, kind] of [
    [400, "invalid"],
    [403, "denied"],
    [404, "not_found"],
    [429, "unavailable"],
  ]) {
    const { client } = fixture(async () => json({ message: "private-canary" }, status));
    await assert.rejects(client.request(actorId, "/v1/users/me", { schema }), { kind, status });
    client.close();
  }
  const { client } = fixture(
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("{"));
          },
        }),
      ),
  );
  await assert.rejects(client.request(actorId, "/v1/users/me", { schema }), { kind: "timeout" });
  client.close();
  const { client: limited } = fixture(async () => new Promise(() => {}), { API_MAX_CONCURRENT_REQUESTS: "1" });
  const first = limited.request(actorId, "/v1/users/me", { schema });
  await new Promise((resolve) => setTimeout(resolve, 10));
  await assert.rejects(limited.request(actorId, "/v1/users/me", { schema }), { kind: "busy" });
  limited.close();
  await assert.rejects(first, { kind: "closed" });
  await assert.rejects(limited.request(actorId, "/v1/users/me", { schema }), { kind: "closed" });
});

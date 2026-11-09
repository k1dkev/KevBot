import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiClientError, createApiClient } from "../index.js";

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

test("builds bounded URLs and forwards injected credentials and authorization", async () => {
  const calls = [];
  const client = createApiClient({
    baseUrl: "https://api.test/",
    fetch: async (url, init) => {
      calls.push({ url: String(url), ...init });
      return json({ data: [] });
    },
  });
  assert.deepEqual(
    await client.request("/v1/search", {
      query: { q: "a cat", type: "tracks" },
      headers: { Authorization: "Bearer actor" },
      credentials: "include",
    }),
    { data: [] },
  );
  const call = calls[0];
  assert.equal(call.url, "https://api.test/v1/search?q=a+cat&type=tracks");
  assert.equal(call.headers.get("authorization"), "Bearer actor");
  assert.equal(call.headers.get("accept"), "application/json");
  assert.equal(call.credentials, "include");
  assert.equal(call.redirect, "error");
  client.close();
});

test("serializes JSON, parses typed payloads, and treats empty success as undefined", async () => {
  const calls = [];
  const client = createApiClient({
    baseUrl: "http://localhost:3000",
    fetch: async (_url, init) => {
      calls.push(init);
      return json({ ok: true });
    },
  });
  assert.deepEqual(
    await client.request("/v1/playlists", {
      method: "POST",
      json: { name: "mix" },
      parse(value) {
        assert.deepEqual(value, { ok: true });
        return "parsed";
      },
    }),
    "parsed",
  );
  assert.equal(calls[0].headers.get("content-type"), "application/json");
  assert.equal(calls[0].body, JSON.stringify({ name: "mix" }));
  client.close();
});

test("rejects unsafe paths and malformed JSON without exposing remote content", async () => {
  let calls = 0;
  const client = createApiClient({
    baseUrl: "https://api.test",
    fetch: async () => {
      calls++;
      return new Response("secret-response-canary");
    },
  });
  for (const path of ["https://other.test/v1/users", "/v1/../private", "/v1/%2e%2e/private", "/v1/users?token=x"])
    await assert.rejects(client.request(path), { kind: "invalid" });
  await assert.rejects(client.request("/v1/users"), (error) => {
    assert.ok(error instanceof ApiClientError);
    assert.equal(error.kind, "protocol");
    assert.doesNotMatch(error.message, /secret-response-canary/);
    return true;
  });
  assert.equal(calls, 1);
  client.close();
});

test("classifies HTTP failures without parsing or relaying private response bodies", async () => {
  const client = createApiClient({ baseUrl: "https://api.test", fetch: async () => json({ secret: "canary" }, 403) });
  await assert.rejects(client.request("/v1/users/@me"), (error) => {
    assert.equal(error.kind, "denied");
    assert.equal(error.status, 403);
    assert.doesNotMatch(error.message, /canary/);
    return true;
  });
  client.close();
});

test("does not retry an unknown mutation outcome after network failure", async () => {
  let attempts = 0;
  const client = createApiClient({
    baseUrl: "https://api.test",
    fetch: async () => {
      attempts++;
      throw new Error("private-response-canary");
    },
  });
  await assert.rejects(client.request("/v1/playlists", { method: "POST", json: { name: "mix" } }), (error) => {
    assert.equal(error.kind, "unavailable");
    assert.equal(error.outcomeUnknown, true);
    assert.doesNotMatch(error.message, /private-response-canary/);
    return true;
  });
  assert.equal(attempts, 1);
  client.close();
});

test("caller cancellation aborts a request without replaying it", async () => {
  const controller = new AbortController();
  let attempts = 0;
  const client = createApiClient({
    baseUrl: "https://api.test",
    fetch: async (_url, init) => {
      attempts++;
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
    },
  });
  const request = client.request("/v1/playlists", {
    method: "POST",
    json: { name: "mix" },
    signal: controller.signal,
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  controller.abort();
  await assert.rejects(request, { kind: "closed", outcomeUnknown: true });
  assert.equal(attempts, 1);
  client.close();
});

test("bounds response size, timeout, concurrency, and shutdown", async () => {
  const large = createApiClient({
    baseUrl: "https://api.test",
    maxResponseBytes: 8,
    fetch: async () => new Response("123456789"),
  });
  await assert.rejects(large.request("/v1/tracks"), { kind: "protocol" });
  large.close();

  const hanging = createApiClient({ baseUrl: "https://api.test", timeoutMs: 25, fetch: () => new Promise(() => {}) });
  await assert.rejects(hanging.request("/v1/tracks"), { kind: "timeout" });
  hanging.close();

  const limited = createApiClient({
    baseUrl: "https://api.test",
    maxConcurrentRequests: 1,
    fetch: () => new Promise(() => {}),
  });
  const first = limited.request("/v1/tracks");
  await new Promise((resolve) => setTimeout(resolve, 5));
  await assert.rejects(limited.request("/v1/tracks"), { kind: "busy" });
  limited.close();
  await assert.rejects(first, { kind: "closed" });
});

test("supports bounded audio bytes with expected content type", async () => {
  const bytes = Uint8Array.from([0, 127, 128, 255]);
  const client = createApiClient({
    baseUrl: "https://api.test",
    fetch: async () => new Response(bytes, { headers: { "content-type": "audio/mpeg" } }),
  });
  assert.deepEqual(
    await client.requestBytes("/v1/tracks/2/stream", { expectedContentType: /^audio\/mpeg(?:\s*;|$)/i }),
    bytes,
  );
  client.close();
});

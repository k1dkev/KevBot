import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, createApiClient } from "./api-client.ts";

function jwt(name: string) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return `${name}.${payload}.signature`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("browser client keeps session-cookie auth separate and injects only the user token", async () => {
  const calls: Array<{ path: string; init: RequestInit }> = [];
  const api = createApiClient({
    baseUrl: "https://api.test",
    fetch: async (input, init) => {
      const path = new URL(String(input)).pathname;
      calls.push({ path, init: init ?? {} });
      if (path === "/v1/auth/discord-exchange")
        return json({ access_token: jwt("browser-user"), token_type: "Bearer", expires_in: 3600 });
      return json({ id: 8, discord_id: "1234567890123456789" });
    },
  });

  try {
    await api.auth.exchangeDiscordCode("oauth-code");
    const user = await api.users.fetch(8);
    assert.equal(user.id, 8);
    assert.equal(calls[0].init.credentials, "include");
    assert.deepEqual(JSON.parse(String(calls[0].init.body)), { code: "oauth-code" });
    assert.equal(new Headers(calls[1].init.headers).get("authorization"), `Bearer ${jwt("browser-user")}`);
    assert.equal(new Headers(calls[1].init.headers).get("x-bot-key"), null);
    assert.equal(calls[1].init.credentials, "same-origin");
  } finally {
    api.close();
  }
});

test("browser client refreshes once after explicit 401 and does not retry uncertain mutations", async () => {
  const calls: Array<{ path: string; init: RequestInit }> = [];
  let refreshes = 0;
  let userRequests = 0;
  const api = createApiClient({
    baseUrl: "https://api.test",
    fetch: async (input, init) => {
      const path = new URL(String(input)).pathname;
      calls.push({ path, init: init ?? {} });
      if (path === "/v1/auth/refresh") {
        refreshes++;
        return json({ access_token: jwt(`refreshed-${refreshes}`), token_type: "Bearer", expires_in: 3600 });
      }
      userRequests++;
      if (userRequests === 1) return json({}, 401);
      return json({ id: 8 });
    },
  });

  try {
    assert.equal((await api.users.fetch(8)).id, 8);
    assert.equal(refreshes, 2);
    assert.equal(userRequests, 2);
    assert.equal(
      calls.filter(({ path }) => path === "/v1/auth/refresh").every(({ init }) => init.credentials === "include"),
      true,
    );
    const userTokens = calls
      .filter(({ path }) => path === "/v1/users/8")
      .map(({ init }) => new Headers(init.headers).get("authorization"));
    assert.deepEqual(
      userTokens.map((token) => token?.split(".")[0]),
      ["Bearer refreshed-1", "Bearer refreshed-2"],
    );
  } finally {
    api.close();
  }

  let attempts = 0;
  const mutationApi = createApiClient({
    baseUrl: "https://api.test",
    fetch: async (input) => {
      if (new URL(String(input)).pathname === "/v1/auth/discord-exchange")
        return json({ access_token: jwt("browser-user"), token_type: "Bearer", expires_in: 3600 });
      attempts++;
      throw new Error("private-response-canary");
    },
  });
  try {
    await mutationApi.auth.exchangeDiscordCode("oauth-code");
    await assert.rejects(
      mutationApi.fetch("/v1/playlists", { method: "POST", body: JSON.stringify({ name: "mix" }) }),
      (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.kind, "unavailable");
        assert.equal(error.outcomeUnknown, true);
        assert.doesNotMatch(error.message, /private-response-canary/);
        return true;
      },
    );
    assert.equal(attempts, 1);
  } finally {
    mutationApi.close();
  }
});

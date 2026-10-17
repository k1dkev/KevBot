import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiClientError } from "../dist/api-client.js";
import { commandRegistry, greetingTypes } from "../dist/commands.js";
import { actorId } from "./helpers.mjs";

function run(name, tokens, request) {
  const command = commandRegistry.get(name);
  assert.ok(command?.execute, `${name} should be implemented`);
  return command.execute({
    prefix: "kb",
    args: command.validate(tokens),
    authorDiscordId: actorId,
    guildId: null,
    api: { request },
  });
}

const track = (id, name, duration = 2.5, deleted_at = null) => ({ id, name, duration, deleted_at });
const playlist = (id, name, deleted_at = null) => ({ id, name, deleted_at });
const greeting = (greeting_track_id = null, greeting_playlist_id = null) => ({
  greeting_track_id,
  greeting_playlist_id,
});
const farewell = (farewell_track_id = null, farewell_playlist_id = null) => ({
  farewell_track_id,
  farewell_playlist_id,
});

test("setgreeting resolves exact names, uses the actor's self endpoint and refuses ambiguous names", async () => {
  const calls = [];
  const response = await run("setgreeting", ["hello"], async (actor, path, options) => {
    calls.push({ actor, path, options });
    if (path === "/v1/search") return { data: [{ type: "track", id: 5, name: "hello", duration: 2.5 }] };
    if (path === "/v1/playlists") return [playlist(8, "hello")];
    return greeting(5, null);
  });
  assert.match(response, /Both a clip and playlist named 'hello'/);
  assert.ok(calls.every((call) => call.actor === actorId));
  assert.equal(
    calls.some((call) => call.options.method === "PUT"),
    false,
  );

  const exactCalls = [];
  const exact = await run("setgreeting", ["hello", "clip"], async (_actor, path, options) => {
    exactCalls.push({ path, options });
    if (path === "/v1/search") {
      assert.deepEqual(options.query, { q: "hello", type: "tracks" });
      return {
        data: [
          { type: "track", id: 5, name: "hello-longer", duration: 2 },
          { type: "track", id: 6, name: "hello", duration: 2 },
        ],
      };
    }
    return greeting(6, null);
  });
  assert.equal(exact, "Set your greeting to clip 'hello'.");
  assert.deepEqual(exactCalls.at(-1).options.json, { greeting_track_id: 6, greeting_playlist_id: null });
});

test("all accepted greeting aliases select the correct entity type and write mutually exclusive IDs", async () => {
  for (const [alias, type] of Object.entries(greetingTypes)) {
    const calls = [];
    const response = await run("setgreeting", ["hello", alias], async (_actor, path, options) => {
      calls.push({ path, options });
      if (path === "/v1/search") return { data: [{ type: "track", id: 5, name: "hello", duration: 2 }] };
      if (path === "/v1/playlists") return [playlist(7, "hello-extra"), playlist(8, "hello")];
      return type === "track" ? greeting(5, null) : greeting(null, 8);
    });
    const write = calls.find((call) => call.options.method === "PUT");
    assert.ok(write, `${alias} should write a preference`);
    assert.deepEqual(
      write.options.json,
      type === "track"
        ? { greeting_track_id: 5, greeting_playlist_id: null }
        : { greeting_track_id: null, greeting_playlist_id: 8 },
    );
    assert.match(response, type === "track" ? /clip 'hello'/ : /playlist 'hello'/);
    assert.equal(
      calls.some((call) => call.path === (type === "track" ? "/v1/playlists" : "/v1/search")),
      false,
    );
  }
});

test("setgreeting reports missing or empty playlists without claiming a successful mutation", async () => {
  const missing = await run("setgreeting", ["absent", "playlist"], async () => []);
  assert.equal(missing, "No clip or playlist named 'absent' was found.");

  const calls = [];
  const empty = await run("setgreeting", ["empty", "playlist"], async (_actor, path, options) => {
    calls.push({ path, options });
    if (path === "/v1/playlists") return [playlist(9, "empty")];
    throw new ApiClientError("invalid", 400);
  });
  assert.equal(empty, "Playlist 'empty' must contain at least one clip before it can be a greeting.");
  assert.equal(calls.at(-1).path, "/v1/users/@me/greeting");
  assert.doesNotMatch(empty, /remote|private|token/i);
});

test("getgreeting displays current clip/playlist names and handles empty and deleted references", async () => {
  const clip = await run("getgreeting", [], async (_actor, path) => {
    if (path === "/v1/users/@me/greeting") return greeting(5);
    return track(5, "hello");
  });
  assert.equal(clip, "Your greeting is clip 'hello'.");

  const playlistGreeting = await run("getgreeting", [], async (_actor, path) => {
    if (path === "/v1/users/@me/greeting") return greeting(null, 8);
    if (path === "/v1/playlists/8") return playlist(8, "welcome");
    return [track(5, "hello")];
  });
  assert.equal(playlistGreeting, "Your greeting playlist is 'welcome'.");

  const emptyPlaylist = await run("getgreeting", [], async (_actor, path) => {
    if (path === "/v1/users/@me/greeting") return greeting(null, 8);
    if (path === "/v1/playlists/8") return playlist(8, "welcome");
    return [];
  });
  assert.match(emptyPlaylist, /is empty and cannot currently be used/);

  const none = await run("getgreeting", [], async () => greeting());
  assert.equal(none, "No greeting is configured.");

  const deleted = await run("getgreeting", [], async (_actor, path) =>
    path === "/v1/users/@me/greeting" ? greeting(5) : track(5, "old", 2, "2026-10-01T00:00:00.000Z"),
  );
  assert.equal(deleted, "Your greeting clip 'old' has been deleted and is unavailable.");

  const deletedPlaylist = await run("getgreeting", [], async (_actor, path) =>
    path === "/v1/users/@me/greeting" ? greeting(null, 8) : playlist(8, "old-welcome", "2026-10-01T00:00:00.000Z"),
  );
  assert.equal(deletedPlaylist, "Your greeting playlist 'old-welcome' has been deleted and is unavailable.");
});

test("delgreeting and delfarewell clear their own preference fields through the authenticated API", async () => {
  const calls = [];
  for (const [name, path, payload, response] of [
    ["delgreeting", "/v1/users/@me/greeting", { greeting_track_id: null, greeting_playlist_id: null }, greeting()],
    ["delfarewell", "/v1/users/@me/farewell", { farewell_track_id: null, farewell_playlist_id: null }, farewell()],
  ]) {
    const result = await run(name, [], async (actor, actualPath, options) => {
      calls.push({ actor, path: actualPath, options });
      return response;
    });
    assert.equal(result, name === "delgreeting" ? "Cleared your greeting." : "Cleared your farewell.");
  }
  assert.deepEqual(
    calls.map(({ actor, path, options }) => [actor, path, options.method, options.json]),
    [
      [actorId, "/v1/users/@me/greeting", "PUT", { greeting_track_id: null, greeting_playlist_id: null }],
      [actorId, "/v1/users/@me/farewell", "PUT", { farewell_track_id: null, farewell_playlist_id: null }],
    ],
  );
});

test("setfarewell accepts clips below four seconds and rejects four seconds or longer before writing", async () => {
  const calls = [];
  const accepted = await run("setfarewell", ["short"], async (_actor, path, options) => {
    calls.push({ path, options });
    if (path === "/v1/search") return { data: [{ type: "track", id: 5, name: "short", duration: 3.999 }] };
    return farewell(5, null);
  });
  assert.equal(accepted, "Set your farewell to clip 'short'.");
  assert.deepEqual(calls.at(-1).options.json, { farewell_track_id: 5, farewell_playlist_id: null });

  calls.length = 0;
  const rejected = await run("setfarewell", ["long"], async (_actor, path) => {
    calls.push(path);
    return { data: [{ type: "track", id: 6, name: "long", duration: 4 }] };
  });
  assert.match(rejected, /must be shorter than 4 seconds/);
  assert.deepEqual(calls, ["/v1/search"]);
});

test("getfarewell reports active, too-long, missing and empty settings", async () => {
  const active = await run("getfarewell", [], async (_actor, path) =>
    path === "/v1/users/@me/farewell" ? farewell(5) : track(5, "beep", 3.99),
  );
  assert.equal(active, "Your farewell is clip 'beep'.");

  const tooLong = await run("getfarewell", [], async (_actor, path) =>
    path === "/v1/users/@me/farewell" ? farewell(5) : track(5, "beep", 4),
  );
  assert.match(tooLong, /no longer valid/);

  const missing = await run("getfarewell", [], async (_actor, path) => {
    if (path === "/v1/users/@me/farewell") return farewell(5);
    throw new ApiClientError("not_found", 404);
  });
  assert.equal(missing, "Your configured farewell clip is unavailable or deleted.");

  const none = await run("getfarewell", [], async () => farewell());
  assert.equal(none, "No farewell is configured.");

  const invalidPlaylist = await run("getfarewell", [], async (_actor, path) => {
    if (path === "/v1/users/@me/farewell") return farewell(null, 8);
    if (path === "/v1/playlists/8") return playlist(8, "old-farewell");
    return [track(6, "long", 4)];
  });
  assert.match(invalidPlaylist, /contains a clip 4 seconds or longer/);

  const emptyPlaylist = await run("getfarewell", [], async (_actor, path) => {
    if (path === "/v1/users/@me/farewell") return farewell(null, 8);
    if (path === "/v1/playlists/8") return playlist(8, "old-farewell");
    return [];
  });
  assert.match(emptyPlaylist, /is empty and cannot currently be used/);
});

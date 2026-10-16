import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiClientError } from "../dist/api-client.js";
import { commandRegistry } from "../dist/commands.js";
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

const playlist = (id, name) => ({ id, name, user_id: 12, created_at: "2026-01-01T00:00:00.000Z", deleted_at: null });
const trackResult = (id, name) => ({ type: "track", id, name });

test("newplaylist creates through the actor API and turns an existing-name conflict into clear feedback", async () => {
  const calls = [];
  const response = await run("newplaylist", ["samples"], async (actor, path, options) => {
    calls.push({ actor, path, options });
    return playlist(31, "samples");
  });
  assert.equal(response, "Created playlist 'samples'.");
  assert.equal(calls[0].actor, actorId);
  assert.equal(calls[0].path, "/v1/playlists");
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(calls[0].options.json, { name: "samples" });

  const conflict = await run("newplaylist", ["samples"], async () => {
    throw new ApiClientError("invalid", 409);
  });
  assert.equal(conflict, "Playlist 'samples' already exists.");
});

test("delplaylist only attempts deletion for an exact active name and explains the empty-only rule", async () => {
  const calls = [];
  const response = await run("delplaylist", ["samples"], async (_actor, path, options) => {
    calls.push({ path, options });
    if (path === "/v1/playlists") return [playlist(31, "samples"), playlist(32, "samples-extra")];
    throw new ApiClientError("invalid", 409);
  });
  assert.equal(response, "Playlist 'samples' must be empty before deletion.");
  assert.deepEqual(
    calls.map((call) => call.path),
    ["/v1/playlists", "/v1/playlists/31"],
  );
  assert.equal(calls[1].options.method, "DELETE");

  const missingCalls = [];
  const missing = await run("delplaylist", ["absent"], async (_actor, path) => {
    missingCalls.push(path);
    return [];
  });
  assert.equal(missing, "Playlist 'absent' was not found.");
  assert.deepEqual(missingCalls, ["/v1/playlists"]);
});

test("addtoplaylist resolves exact track names, deduplicates inputs and reports partial/missing outcomes", async () => {
  const calls = [];
  const response = await run(
    "addtoplaylist",
    ["samples", "clip1", "clip2", "missing", "clip1"],
    async (actor, path, options) => {
      calls.push({ actor, path, options });
      if (path === "/v1/playlists") return [playlist(31, "samples")];
      if (path === "/v1/search") {
        const name = options.query.q;
        return { data: name === "missing" ? [] : [trackResult(name === "clip1" ? 41 : 42, name)] };
      }
      return { playlist_id: 31, added_track_ids: [41] };
    },
  );
  assert.match(response, /Added to 'samples': clip1\./);
  assert.match(response, /Already in 'samples': clip2\./);
  assert.match(response, /Not found: missing\./);
  assert.equal(calls.filter((call) => call.path === "/v1/search").length, 3);
  assert.deepEqual(calls.at(-1).options.json, { track_ids: [41, 42] });
  assert.ok(calls.every((call) => call.actor === actorId));
});

test("delfromplaylist reports removals and clips that were not playlist members", async () => {
  const response = await run("delfromplaylist", ["samples", "clip1", "clip2"], async (_actor, path, options) => {
    if (path === "/v1/playlists") return [playlist(31, "samples")];
    if (path === "/v1/search") return { data: [trackResult(options.query.q === "clip1" ? 41 : 42, options.query.q)] };
    return { deleted_track_ids: [41], not_in_playlist_track_ids: [42] };
  });
  assert.equal(response, "Removed from 'samples': clip1.\nNot in 'samples': clip2.");
});

test("addplayliststo continues per playlist, reports unknown names, and keeps API errors safe", async () => {
  const calls = [];
  const response = await run("addplayliststo", ["clip1", "first", "second", "missing"], async (_actor, path, options) => {
    calls.push({ path, options });
    if (path === "/v1/search") return { data: [trackResult(41, "clip1")] };
    if (path === "/v1/playlists") {
      const name = options.query.name;
      return name === "missing" ? [] : [playlist(name === "first" ? 31 : 32, name)];
    }
    if (path === "/v1/playlists/31/tracks") return { playlist_id: 31, added_track_ids: [41] };
    throw new ApiClientError("denied", 403);
  });
  assert.match(response, /first: added\./);
  assert.match(response, /second: The API denied this operation for your account\./);
  assert.match(response, /Playlists not found: missing\./);
  assert.equal(calls.filter((call) => call.path.endsWith("/tracks")).length, 2);
  assert.doesNotMatch(response, /private|token|secret/i);
});

test("delplaylistsfrom resolves the clip once and reports each playlist result", async () => {
  const calls = [];
  const response = await run("delplaylistsfrom", ["clip1", "first", "second"], async (_actor, path, options) => {
    calls.push({ path, options });
    if (path === "/v1/search") return { data: [trackResult(41, "clip1")] };
    if (path === "/v1/playlists") return [playlist(options.query.name === "first" ? 31 : 32, options.query.name)];
    return path.endsWith("/31/tracks")
      ? { deleted_track_ids: [41], not_in_playlist_track_ids: [] }
      : { deleted_track_ids: [], not_in_playlist_track_ids: [41] };
  });
  assert.equal(response, "first: removed.\nsecond: not in playlist.");
  assert.equal(calls.filter((call) => call.path === "/v1/search").length, 1);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { commandRegistry } from "../dist/commands.js";
import { searchLibrary } from "../dist/search-command.js";

const actor = "1234567890123456789";
const args = (tokens) => commandRegistry.get("search").validate(tokens);

test("search queries tracks and playlists through actor-authenticated API and ranks bounded results", async () => {
  const calls = [];
  const api = {
    async request(user, path, options) {
      calls.push({ user, path, query: options.query });
      return {
        data:
          options.query.type === "tracks"
            ? [
                { type: "track", id: 1, name: "funnytrack", relevance: 0.6, duration: 2.3 },
                { type: "user", id: 12, name: "not-for-discord", relevance: 0.99 },
              ]
            : [{ type: "playlist", id: 3, name: "funnyplaylist", relevance: 0.9, track_count: 4 }],
      };
    },
  };
  const response = await searchLibrary({ args: args(["Funny cats", "type:both"]), authorDiscordId: actor, api });
  assert.deepEqual(
    calls.map(({ query }) => query.type),
    ["tracks", "playlists"],
  );
  assert.ok(
    calls.every(({ user, path, query }) => user === actor && path === "/v1/search" && query.q === "Funny cats"),
  );
  assert.match(response, /Search results for “Funny cats”/);
  assert.match(response, /1\. funnyplaylist — playlist · 4 tracks/);
  assert.match(response, /2\. funnytrack — track · 2\.3s/);
  assert.doesNotMatch(response, /not-for-discord/);
});

test("search can be restricted to one entity type and returns safe empty feedback", async () => {
  const calls = [];
  const api = {
    async request(_user, _path, options) {
      calls.push(options.query.type);
      return { data: [{ type: "user", id: 4, name: "hidden", relevance: 1 }] };
    },
  };
  const response = await searchLibrary({ args: args(["@everyone", "type:playlists"]), authorDiscordId: actor, api });
  assert.deepEqual(calls, ["playlists"]);
  assert.match(response, /No matching tracks or playlists/);
  assert.doesNotMatch(response, /@everyone/);
});

test("search validation bounds query text and parses an optional type marker", () => {
  assert.equal(args(["piano", "type:tracks"]).searchType, "tracks");
  assert.equal(args(["piano", "type:playlists"]).searchType, "playlists");
  assert.equal(args(["piano", "tracks"]).searchQuery, "piano tracks");
  assert.throws(() => args([" "]));
  assert.throws(() => args(["x".repeat(101)]));
});

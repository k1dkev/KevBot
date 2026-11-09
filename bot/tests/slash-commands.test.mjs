import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { commandRegistry } from "../dist/commands.js";
import { slashCommandDefinitions, slashCommandTokens } from "../dist/slash-commands.js";

function interaction(commandName, values = {}) {
  const options = {
    getString(name, required = false) {
      const value = values[name] ?? null;
      if (required && value === null) throw new Error(`missing ${name}`);
      return value;
    },
    getInteger(name, required = false) {
      const value = values[name] ?? null;
      if (required && value === null) throw new Error(`missing ${name}`);
      return value;
    },
  };
  return { commandName, options };
}

test("slash definitions cover every registry command once and expose /search", () => {
  const names = slashCommandDefinitions.map(({ name }) => name);
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual([...names].sort(), [...commandRegistry.keys()].sort());
  assert.equal(names.length, 19);
  const search = slashCommandDefinitions.find(({ name }) => name === "search");
  assert.deepEqual(
    search.options.map(({ name }) => name),
    ["query", "type"],
  );
  assert.equal(search.options[0].required, true);
  const upload = slashCommandDefinitions.find(({ name }) => name === "upload");
  assert.equal(upload.options[0].type, 11);
});

test("command registration CLI rejects missing IDs offline without contacting Discord", () => {
  const result = spawnSync(process.execPath, ["dist/register-commands.js"], {
    cwd: new URL("..", import.meta.url),
    env: { PATH: process.env.PATH, DISCORD_BOT_TOKEN: "registration-secret-canary" },
    encoding: "utf8",
    timeout: 5000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /valid application ID/);
  assert.doesNotMatch(result.stdout + result.stderr, /registration-secret-canary/);
});

test("slash source choices remain separate from ordinary playlist names", () => {
  const playlistTokens = slashCommandTokens(interaction("pr", { playlist: "allcats" }));
  assert.deepEqual(playlistTokens, ["playlist:allcats"]);
  assert.deepEqual(commandRegistry.get("pr").validate(playlistTokens).pool, { type: "playlist", name: "allcats" });

  const sourceTokens = slashCommandTokens(interaction("pr", { source: "most_played", length: 25 }));
  assert.deepEqual(sourceTokens, ["source:most_played", "25"]);
  assert.deepEqual(commandRegistry.get("pr").validate(sourceTokens).pool, { type: "most_played" });
  assert.equal(commandRegistry.get("pr").validate(sourceTokens).limit, 25);
});

test("slash adapters map typed inputs to the shared command validators", () => {
  assert.deepEqual(slashCommandTokens(interaction("raid", { track: "clip", channel_number: 3 })), ["clip", "3"]);
  assert.deepEqual(slashCommandTokens(interaction("setgreeting", { name: "allcats", type: "track" })), [
    "allcats",
    "file",
  ]);
  assert.deepEqual(slashCommandTokens(interaction("addtoplaylist", { playlist: "mix", tracks: "one two three" })), [
    "mix",
    "one",
    "two",
    "three",
  ]);
  const searchTokens = slashCommandTokens(interaction("search", { query: "Funny cats", type: "both" }));
  assert.deepEqual(searchTokens, ["Funny cats", "type:both"]);
  assert.deepEqual(commandRegistry.get("search").validate(searchTokens), {
    tokens: searchTokens,
    searchQuery: "Funny cats",
    searchType: "both",
  });
});

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

test(
  "browser bundles contain no delegated bot credentials or bot authentication routes",
  { skip: process.env.CHECK_API_CLIENT_BUNDLE !== "1" },
  () => {
    const chunks = filesUnder(".next/static/chunks").filter((path) => path.endsWith(".js"));
    assert.ok(chunks.length > 0, "expected a production browser bundle");
    const bundle = chunks.map((path) => readFileSync(path, "utf8")).join("\n");
    for (const marker of ["BOT_AUTH_API_KEY", "DISCORD_BOT_TOKEN", "/v1/bot/auth", "/v1/bot/actors/resolve"])
      assert.equal(bundle.includes(marker), false, `browser bundle includes ${marker}`);
  },
);

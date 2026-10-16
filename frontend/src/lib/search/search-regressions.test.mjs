// Pure navigation contracts use the existing TypeScript compiler and Node runner.
// React/history/network behavior is exercised in tests/browser/overhaul.spec.ts.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("./search-navigation.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
});
const navigation = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

test("unsupported tabs, invalid sorts and conflicting scopes normalize consistently", () => {
  for (const [pathname, query, type, sort] of [
    ["/search", "type=all&sort=relevance", "tracks", "name"],
    ["/search", "q=beat&type=users&sort=play_count", "users", "relevance"],
    ["/search", "type=playlists&sort=play_count", "playlists", "name"],
    ["/user/7/search", "type=users", "tracks", undefined],
    ["/playlist/8", "type=playlists", "tracks", undefined],
    ["/search", "type=users&user_id=7", "tracks", undefined],
    ["/search", "type=playlists&playlist_id=8", "tracks", undefined],
  ]) {
    const params = new URLSearchParams(query);
    const draft = navigation.readSearchDraft(pathname, params);
    assert.equal(draft.type, type);
    assert.equal(draft.sort, sort);
    const href = navigation.canonicalSearchHref(pathname, params);
    assert.ok(href);
    const normalized = new URL(href, "https://example.test");
    assert.equal(normalized.searchParams.get("type"), type);
    assert.equal(navigation.canonicalSearchHref(pathname, normalized.searchParams), null);
  }
});

test("committed search preserves scope/options and omits false deleted and stale offsets", () => {
  const href = navigation.searchHref("/user/7/search", new URLSearchParams("user_id=7&offset=25"), {
    query: " beat ",
    type: "playlists",
    sort: "created_at",
    order: "asc",
    includeDeleted: false,
  });
  const url = new URL(href, "https://example.test");
  assert.equal(url.pathname, "/user/7/search");
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    user_id: "7",
    q: "beat",
    type: "playlists",
    sort: "created_at",
    order: "asc",
  });
  const global = new URL(
    navigation.searchHref("/user/7", new URLSearchParams("user_id=7"), {
      query: "new",
      type: "users",
      order: "desc",
      includeDeleted: true,
    }),
    "https://example.test",
  );
  assert.equal(global.pathname, "/search");
  assert.equal(global.searchParams.has("user_id"), false);
  assert.equal(global.searchParams.get("include_deleted"), "true");
});

test("canonicalization avoids navigation loops and validates numeric scope identifiers", () => {
  assert.equal(navigation.canonicalSearchHref("/search", new URLSearchParams("q=beat&type=tracks&sort=name")), null);
  assert.equal(navigation.canonicalSearchHref("/login", new URLSearchParams("type=all")), null);
  assert.equal(navigation.canonicalSearchHref("/search", new URLSearchParams("include_deleted=false")), "/search");
  assert.equal(navigation.searchScopeId("7"), 7);
  for (const value of ["", "0", "-1", "nope", "9007199254740992"])
    assert.equal(navigation.searchScopeId(value), undefined);
});

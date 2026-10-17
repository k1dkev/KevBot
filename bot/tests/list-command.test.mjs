import assert from "node:assert/strict";
import { test } from "node:test";
import { commandRegistry } from "../dist/commands.js";
import { actorId } from "./helpers.mjs";

const playlist = (id, name) => ({ id, name, deleted_at: null });
const track = (id, name, extra = {}) => ({
  id,
  name,
  playable: true,
  unavailable_reason: null,
  deleted_at: null,
  ...extra,
});
const pagination = (total, limit, offset) => ({
  total,
  limit,
  offset,
  hasNext: offset + limit < total,
  hasPrev: offset > 0,
});

function run(tokens, request) {
  const command = commandRegistry.get("list");
  return command.execute({
    args: command.validate(tokens),
    authorDiscordId: actorId,
    api: { request },
  });
}

test("default all-tracks list pages through the full source instead of silently stopping at page one", async () => {
  const calls = [];
  const first = Array.from({ length: 100 }, (_, index) => track(index + 1, `track${index + 1}`));
  const second = [track(101, "track101"), track(102, "track102")];
  const response = await run([], async (actor, path, options) => {
    calls.push({ actor, path, options });
    assert.equal(path, "/v1/library/pools");
    const offset = options.query.offset;
    return {
      kind: "tracks",
      data: offset === 0 ? first : second,
      pagination: pagination(102, 100, offset),
    };
  });
  assert.deepEqual(
    calls.map(({ actor, options }) => [actor, options.query]),
    [
      [actorId, { source: "all_tracks", playlist_id: undefined, limit: 100, offset: 0 }],
      [actorId, { source: "all_tracks", playlist_id: undefined, limit: 100, offset: 100 }],
    ],
  );
  assert.match(response, /^all tracks \(102\):/);
  assert.match(response, /1\. track1/);
  assert.match(response, /102\. track102/);
});

test("playlist names resolve exactly to playlist IDs; special-looking names remain ordinary playlists", async () => {
  const calls = [];
  const response = await run(["allcats"], async (_actor, path, options) => {
    calls.push({ path, options });
    if (path === "/v1/playlists") return [playlist(44, "allcats"), playlist(45, "allcats-extra")];
    return {
      kind: "tracks",
      data: [track(7, "sample")],
      pagination: pagination(1, 100, 0),
    };
  });
  assert.equal(calls[0].path, "/v1/playlists");
  assert.deepEqual(calls[0].options.query, { name: "allcats" });
  assert.deepEqual(calls[1].options.query, {
    source: "playlist",
    playlist_id: 44,
    limit: 100,
    offset: 0,
  });
  assert.match(response, /^playlist 'allcats' \(1\):/);
  assert.match(response, /sample/);
});

test("ranked lists use the accepted default length and disclose when more results exist", async () => {
  let query;
  const response = await run(["source:most_played"], async (_actor, _path, options) => {
    query = options.query;
    return {
      kind: "tracks",
      data: [track(4, "popular", { ordinary_play_count: 17 })],
      pagination: pagination(90, 25, 0),
    };
  });
  assert.deepEqual(query, { source: "most_played", playlist_id: undefined, limit: 25, offset: 0 });
  assert.match(response, /^most played \(1 of 90\):/);
  assert.match(response, /popular — 17 plays/);
});

test("play history preserves repeated events, timestamps, types, and unavailable references", async () => {
  const response = await run(["source:play_history", "25"], async () => ({
    kind: "play_events",
    data: [
      {
        event_id: 8,
        track_id: 12,
        played_at: "2026-06-02T09:30:00.000Z",
        play_type: 1,
        name: "repeat",
        playable: true,
        unavailable_reason: null,
      },
      {
        event_id: 7,
        track_id: 12,
        played_at: "2026-06-02T09:20:00.000Z",
        play_type: 5,
        name: "repeat",
        playable: false,
        unavailable_reason: "deleted_track",
      },
      {
        event_id: 6,
        track_id: 13,
        played_at: "2026-06-02T09:10:00.000Z",
        play_type: 0,
        name: null,
        playable: false,
        unavailable_reason: "missing_track",
      },
    ],
    pagination: pagination(3, 25, 0),
  }));
  assert.match(response, /^play history \(3 of 3\):/);
  assert.match(response, /2026-06-02 09:30 UTC — repeat \(random\)/);
  assert.match(response, /2026-06-02 09:20 UTC — repeat \(playlist greeting\) \[deleted track\]/);
  assert.match(response, /Unknown track #13 \(play\) \[missing track\]/);
  assert.equal((response.match(/— repeat/g) ?? []).length, 2);
});

test("upload history labels deleted uploads while keeping the recorded upload timestamp", async () => {
  const response = await run(["source:upload_history"], async () => ({
    kind: "tracks",
    data: [
      track(3, "gone", { playable: false, unavailable_reason: "deleted_track", created_at: "2026-06-03T01:02:00Z" }),
    ],
    pagination: pagination(1, 25, 0),
  }));
  assert.match(response, /upload history \(1 of 1\):/);
  assert.match(response, /gone — 2026-06-03 01:02 UTC \[deleted track\]/);
});

test("missing playlist and empty source return clear non-success feedback", async () => {
  const missing = await run(["absent"], async () => []);
  assert.equal(missing, "Playlist 'absent' was not found.");
  const empty = await run([], async () => ({ kind: "tracks", data: [], pagination: pagination(0, 100, 0) }));
  assert.equal(empty, "No entries in all tracks (0).");
});

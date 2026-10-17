import assert from "node:assert/strict";
import { test } from "node:test";
import { PlaybackError } from "../dist/playback.js";
import { AutomaticVoiceEvents } from "../dist/voice-events.js";
import { actorId, logs } from "./helpers.mjs";

const guildId = "guild-1";
const channelA = "voice-1";
const channelB = "voice-2";
const state = (channelId, overrides = {}) => ({
  id: actorId,
  guildId,
  channelId,
  member: { user: { bot: false } },
  ...overrides,
});

function fixture({ greeting, farewell, currentChannel = channelB } = {}) {
  const calls = [];
  const plays = [];
  const { log, records } = logs();
  const api = {
    async request(actor, path) {
      calls.push({ actor, path });
      if (path === "/v1/users/@me/greeting") return greeting ?? { greeting_track_id: null, greeting_playlist_id: null };
      if (path === "/v1/users/@me/farewell") return farewell ?? { farewell_track_id: null, farewell_playlist_id: null };
      throw new Error(`Unexpected route ${path}`);
    },
  };
  const playback = {
    async play(request) {
      plays.push(request);
    },
  };
  const events = new AutomaticVoiceEvents(
    api,
    playback,
    log,
    (_guildId, _userId, channelId) => channelId === currentChannel,
  );
  return { events, calls, plays, records };
}

test("join plays the member's exact configured greeting in the destination channel", async () => {
  const { events, calls, plays } = fixture({ greeting: { greeting_track_id: 9, greeting_playlist_id: null } });
  await events.handle(state(null), state(channelB));
  assert.deepEqual(calls, [{ actor: actorId, path: "/v1/users/@me/greeting" }]);
  assert.deepEqual(plays, [
    {
      kind: "greeting",
      actorDiscordId: actorId,
      guildId,
      voiceChannelId: channelB,
      trackId: 9,
    },
  ]);
});

test("playlist greeting uses typed playlist playback", async () => {
  const { events, plays } = fixture({ greeting: { greeting_track_id: null, greeting_playlist_id: 22 } });
  await events.handle(state(null), state(channelB));
  assert.equal(plays[0].kind, "playlist_greeting");
  assert.equal(plays[0].playlistId, 22);
});

test("leave plays farewell in the channel the member left", async () => {
  const { events, plays } = fixture({
    farewell: { farewell_track_id: 10, farewell_playlist_id: null },
    currentChannel: null,
  });
  await events.handle(state(channelA), state(null));
  assert.deepEqual(plays, [
    {
      kind: "farewell",
      actorDiscordId: actorId,
      guildId,
      voiceChannelId: channelA,
      trackId: 10,
    },
  ]);
});

test("farewell playlist requests a random active clip shorter than four seconds", async () => {
  const { events, calls, plays } = fixture({
    farewell: { farewell_track_id: null, farewell_playlist_id: 33 },
    currentChannel: null,
  });
  await events.handle(state(channelA), state(null));
  assert.equal(calls.length, 1);
  assert.equal(plays[0].playlistId, 33);
  assert.equal(plays[0].maxDuration, 4);
  assert.equal(plays[0].kind, "farewell");
});

test("channel switches, bots, stale transitions, and missing preferences do not play", async () => {
  const ordinary = fixture({ greeting: { greeting_track_id: 9, greeting_playlist_id: null } });
  await ordinary.events.handle(state(channelA), state(channelB));
  await ordinary.events.handle(state(null), state(channelB, { member: { user: { bot: true } } }));
  assert.equal(ordinary.plays.length, 0);

  const stale = fixture({ greeting: { greeting_track_id: 9, greeting_playlist_id: null }, currentChannel: channelA });
  await stale.events.handle(state(null), state(channelB));
  assert.equal(stale.plays.length, 0);
  assert.ok(stale.records.some((record) => record.event === "voice_event.skipped"));

  const missing = fixture();
  await missing.events.handle(state(null), state(channelB));
  assert.equal(missing.plays.length, 0);
});

test("overlapping automatic playback is diagnosed without escaping the gateway handler", async () => {
  const { log, records } = logs();
  const events = new AutomaticVoiceEvents(
    {
      async request() {
        return { greeting_track_id: 9, greeting_playlist_id: null };
      },
    },
    {
      async play() {
        throw new PlaybackError("busy");
      },
    },
    log,
    () => true,
  );
  await events.handle(state(null), state(channelB));
  assert.ok(records.some((record) => record.event === "voice_event.failed" && record.reason === "busy"));
});

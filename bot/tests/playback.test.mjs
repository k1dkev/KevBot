import assert from "node:assert/strict";
import { test } from "node:test";
import { ChannelType } from "discord.js";
import { PlaybackError, PlaybackService, playbackUserMessage } from "../dist/playback.js";
import { DiscordVoicePlatform } from "../dist/voice.js";
import { actorId, logs } from "./helpers.mjs";

function fakeApi() {
  const calls = [];
  const api = {
    async request(_actor, path, options = {}) {
      calls.push({ path, options });
      if (path === "/v1/search" && options.query.type === "tracks")
        return {
          data: [{ type: "track", id: 11, name: "clip", duration: 2, deleted_at: null }],
          pagination: { total: 1, limit: 100, offset: 0 },
        };
      if (path === "/v1/search" && options.query.type === "playlists")
        return {
          data: [{ type: "playlist", id: 42, name: "allcats", deleted_at: null }],
          pagination: { total: 1, limit: 100, offset: 0 },
        };
      if (path === "/v1/library/pools/random")
        return {
          track_id: 11,
          source:
            options.query.source === "playlist"
              ? { type: "playlist", playlist_id: options.query.playlist_id }
              : { type: options.query.source },
        };
      if (path === "/v1/tracks/11") return { id: 11, name: "clip", duration: 2, deleted_at: null };
      if (path === "/v1/plays/events") return { event_id: options.json.event_id, duplicate: false };
      throw new Error(`Unexpected API path: ${path}`);
    },
    async requestAudio(_actor, path) {
      calls.push({ path, audio: true });
      return Buffer.from([0, 1, 255]);
    },
  };
  return { api, calls };
}

function fakeVoice(options = {}) {
  const calls = [];
  let closed = 0;
  return {
    calls,
    get closed() {
      return closed;
    },
    callerChannel(guildId, channelId) {
      return channelId ? { guildId, channelId } : undefined;
    },
    numberedChannel(guildId, number) {
      return number === 3 ? { guildId, channelId: "voice-3" } : undefined;
    },
    async play(target, audio, onStarted) {
      calls.push({ target, audio });
      if (options.fail) throw new Error("synthetic voice failure");
      await onStarted();
      if (options.onStartedTwice) await onStarted();
      await options.wait?.();
    },
    close() {
      closed++;
    },
  };
}

const direct = (overrides = {}) => ({
  kind: "play",
  actorDiscordId: actorId,
  guildId: "guild-1",
  voiceChannelId: "voice-1",
  trackName: "clip",
  ...overrides,
});

test("exact playback resolves by exact name and reports only after the voice player starts", async () => {
  const { api, calls } = fakeApi();
  const voice = fakeVoice({ onStartedTwice: true });
  const { log, records } = logs();
  const service = new PlaybackService(api, voice, log);
  assert.equal(await service.play(direct()), "Finished playing clip.");
  assert.equal(calls.find((call) => call.path === "/v1/search").options.query.type, "tracks");
  assert.equal(voice.calls.length, 1);
  const report = calls.find((call) => call.path === "/v1/plays/events").options.json;
  assert.equal(report.track_id, 11);
  assert.equal(report.play_type, "play");
  assert.equal(report.playback_started, true);
  assert.match(report.event_id, /^[0-9a-f-]{36}$/);
  assert.equal(records.filter((record) => record.event === "playback.reported").length, 1);
});

test("random playlist selection sends typed source IDs and preserves selected source in the event", async () => {
  const { api, calls } = fakeApi();
  const voice = fakeVoice();
  const { log } = logs();
  const service = new PlaybackService(api, voice, log);
  await service.play(
    direct({
      kind: "random",
      trackName: undefined,
      pool: { type: "playlist", name: "allcats" },
    }),
  );
  const random = calls.find((call) => call.path === "/v1/library/pools/random");
  assert.deepEqual(random.options.query, { source: "playlist", playlist_id: 42, limit: undefined });
  assert.deepEqual(calls.find((call) => call.path === "/v1/plays/events").options.json.source, {
    type: "playlist",
    playlist_id: 42,
  });
  assert.equal(voice.calls[0].target.channelId, "voice-1");
});

test("automatic greeting playback accepts an exact track ID and reports the greeting kind", async () => {
  const { api, calls } = fakeApi();
  const voice = fakeVoice();
  const { log } = logs();
  const service = new PlaybackService(api, voice, log);
  await service.play(direct({ kind: "greeting", trackName: undefined, trackId: 11 }));
  assert.equal(voice.calls[0].target.channelId, "voice-1");
  assert.equal(calls.find((call) => call.path === "/v1/plays/events").options.json.play_type, "greeting");
});

test("playlist greetings use typed playlist selection and preserve the selected playlist ID", async () => {
  const { api, calls } = fakeApi();
  const voice = fakeVoice();
  const { log } = logs();
  const service = new PlaybackService(api, voice, log);
  await service.play(direct({ kind: "playlist_greeting", trackName: undefined, playlistId: 42 }));
  const selection = calls.find((call) => call.path === "/v1/library/pools/random");
  assert.deepEqual(selection.options.query, { source: "playlist", playlist_id: 42, limit: undefined });
  const report = calls.find((call) => call.path === "/v1/plays/events").options.json;
  assert.equal(report.play_type, "playlist_greeting");
  assert.deepEqual(report.source, { type: "playlist", playlist_id: 42 });
});

test("playlist farewells select only eligible clips and report farewell without a greeting source", async () => {
  const { api, calls } = fakeApi();
  const voice = fakeVoice();
  const { log } = logs();
  const service = new PlaybackService(api, voice, log);
  await service.play(direct({ kind: "farewell", trackName: undefined, playlistId: 42, maxDuration: 4 }));
  const selection = calls.find((call) => call.path === "/v1/library/pools/random");
  assert.deepEqual(selection.options.query, {
    source: "playlist",
    playlist_id: 42,
    limit: undefined,
    max_duration: 4,
  });
  const report = calls.find((call) => call.path === "/v1/plays/events").options.json;
  assert.equal(report.play_type, "farewell");
  assert.equal(report.source, undefined);
});

test("raid uses the numbered target and records raid, while manual playback is exclusive per guild", async () => {
  const { api, calls } = fakeApi();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const voice = fakeVoice({ wait: () => gate });
  const { log } = logs();
  const service = new PlaybackService(api, voice, log);
  const first = service.play(direct({ kind: "raid", channelNumber: 3, voiceChannelId: null }));
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(service.play(direct()), (error) => error instanceof PlaybackError && error.reason === "busy");
  assert.equal(voice.calls[0].target.channelId, "voice-3");
  assert.equal(calls.find((call) => call.path === "/v1/plays/events").options.json.play_type, "raid");
  release();
  await first;
});

test("independent guilds may play concurrently", async () => {
  const { api } = fakeApi();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const voice = fakeVoice({ wait: () => gate });
  const { log } = logs();
  const service = new PlaybackService(api, voice, log);
  const first = service.play(direct({ guildId: "guild-1" }));
  const second = service.play(direct({ guildId: "guild-2" }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(voice.calls.length, 2);
  release();
  await Promise.all([first, second]);
});

test("failed voice start never reports a play and gives a static safe response", async () => {
  const { api, calls } = fakeApi();
  const { log } = logs();
  const service = new PlaybackService(api, fakeVoice({ fail: true }), log);
  await assert.rejects(service.play(direct()), (error) => {
    assert.ok(error instanceof PlaybackError);
    assert.equal(playbackUserMessage(error), "Playback could not be completed. Please try again later.");
    return true;
  });
  assert.equal(
    calls.some((call) => call.path === "/v1/plays/events"),
    false,
  );
});

test("missing voice context is rejected before API access; close stops future commands", async () => {
  const { api, calls } = fakeApi();
  const voice = fakeVoice();
  const { log } = logs();
  const service = new PlaybackService(api, voice, log);
  await assert.rejects(service.play(direct({ voiceChannelId: null })), { reason: "no_channel" });
  assert.equal(calls.length, 0);
  service.close();
  assert.equal(voice.closed, 1);
  await assert.rejects(service.play(direct()), { reason: "closed" });
});

test("raid channel numbering is 1-based display order, handles grouped channels, and excludes stage channels", () => {
  const lowerGroup = { rawPosition: 0 };
  const higherGroup = { rawPosition: 8 };
  const channels = [
    { id: "voice-c", type: ChannelType.GuildVoice, rawPosition: 90, parent: higherGroup },
    { id: "voice-b", type: ChannelType.GuildVoice, rawPosition: 90, parent: lowerGroup },
    { id: "stage", type: ChannelType.GuildStageVoice, rawPosition: 1, parent: lowerGroup },
    { id: "voice-a", type: ChannelType.GuildVoice, rawPosition: 90, parent: lowerGroup },
  ];
  const guild = { channels: { cache: { values: () => channels } } };
  const client = { guilds: { cache: { get: () => guild } } };
  const { log } = logs();
  const platform = new DiscordVoicePlatform(client, log);
  assert.deepEqual(platform.numberedChannel("guild-1", 1), { guildId: "guild-1", channelId: "voice-a" });
  assert.deepEqual(platform.numberedChannel("guild-1", 2), { guildId: "guild-1", channelId: "voice-b" });
  assert.deepEqual(platform.numberedChannel("guild-1", 3), { guildId: "guild-1", channelId: "voice-c" });
  assert.equal(platform.numberedChannel("guild-1", 4), undefined);
  assert.equal(platform.numberedChannel("guild-1", 0), undefined);
});

test("voice permissions are checked before attempting a Discord connection", async () => {
  const channel = {
    id: "voice-1",
    type: ChannelType.GuildVoice,
    permissionsFor: () => ({ has: () => false }),
  };
  const guild = {
    id: "guild-1",
    members: { me: {} },
    channels: { cache: { get: () => channel } },
  };
  const client = { guilds: { cache: { get: () => guild } } };
  const { log } = logs();
  const platform = new DiscordVoicePlatform(client, log);
  await assert.rejects(
    platform.play({ guildId: "guild-1", channelId: "voice-1" }, Buffer.from([1]), async () => {}),
    /voice_permission_denied/,
  );
});

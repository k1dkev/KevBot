import assert from "node:assert/strict";
import { test } from "node:test";
import { MessageFlags } from "discord.js";
import { handleSlashInteraction, sendEphemeralResponse } from "../dist/slash-interactions.js";
import { config, logs } from "./helpers.mjs";

test("long slash results use an ephemeral initial reply and private follow-ups", async () => {
  const calls = [];
  const interaction = {
    async editReply(payload) {
      calls.push({ method: "edit", ...payload });
    },
    async followUp(payload) {
      calls.push({ method: "followUp", ...payload });
    },
  };
  const { log } = logs();
  assert.equal(await sendEphemeralResponse(interaction, "x".repeat(4500), config(), log), true);
  assert.deepEqual(
    calls.map(({ method }) => method),
    ["edit", "followUp", "followUp"],
  );
  assert.deepEqual(
    calls.map(({ content }) => content.length),
    [2000, 2000, 500],
  );
  assert.ok(calls.every(({ allowedMentions }) => allowedMentions.parse.length === 0));
  assert.ok(calls.slice(1).every(({ flags }) => flags === MessageFlags.Ephemeral));
});

test("slash command is acknowledged privately and dispatch receives actor, voice and attachment context", async () => {
  const received = [];
  const calls = [];
  const attachment = {
    name: "clip.mp3",
    url: "https://cdn.discordapp.com/attachments/1/2/clip.mp3",
    size: 1024,
    contentType: "audio/mpeg",
  };
  const interaction = {
    id: "5554567890123456789",
    commandName: "upload",
    user: { id: "1234567890123456789" },
    guildId: "3334567890123456789",
    guild: { voiceStates: { cache: new Map([["1234567890123456789", { channelId: "4444567890123456789" }]]) } },
    options: {
      getString(name) {
        return name === "playlists" ? "mix backup" : null;
      },
      getInteger() {
        return null;
      },
      getAttachment(name) {
        return name === "file" ? attachment : null;
      },
    },
    async deferReply(payload) {
      calls.push({ method: "defer", ...payload });
    },
    async editReply(payload) {
      calls.push({ method: "edit", ...payload });
    },
    async followUp(payload) {
      calls.push({ method: "followUp", ...payload });
    },
  };
  const dispatcher = {
    async handleSlash(invocation) {
      received.push(invocation);
      return "Uploaded clip 'clip'. Added to playlists: mix, backup.";
    },
  };
  const { log } = logs();
  await handleSlashInteraction(interaction, dispatcher, config(), log);
  assert.equal(calls[0].method, "defer");
  assert.equal(calls[0].flags, MessageFlags.Ephemeral);
  assert.equal(calls[1].method, "edit");
  assert.match(calls[1].content, /Uploaded clip/);
  assert.equal(received[0].commandName, "upload");
  assert.deepEqual(received[0].tokens, ["mix", "backup"]);
  assert.equal(received[0].authorDiscordId, interaction.user.id);
  assert.equal(received[0].voiceChannelId, "4444567890123456789");
  assert.deepEqual(received[0].attachments, [attachment]);
});

test("slash dispatch failures return static private feedback instead of raw error text", async () => {
  const calls = [];
  const interaction = {
    id: "5554567890123456789",
    commandName: "newplaylist",
    user: { id: "1234567890123456789" },
    guildId: null,
    guild: null,
    options: {
      getString: () => "newmix",
      getInteger: () => null,
      getAttachment: () => null,
    },
    async deferReply(payload) {
      calls.push({ method: "defer", ...payload });
    },
    async editReply(payload) {
      calls.push({ method: "edit", ...payload });
    },
    async followUp(payload) {
      calls.push({ method: "followUp", ...payload });
    },
  };
  const dispatcher = {
    async handleSlash() {
      throw new Error("secret-canary");
    },
  };
  const { log, records } = logs();
  await handleSlashInteraction(interaction, dispatcher, config(), log);
  assert.match(calls[1].content, /could not be completed/);
  assert.doesNotMatch(JSON.stringify([...calls, ...records]), /secret-canary/);
  assert.equal(calls[0].flags, MessageFlags.Ephemeral);
});

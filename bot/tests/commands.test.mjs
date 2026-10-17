import assert from "node:assert/strict";
import { test } from "node:test";
import { commands, commandRegistry, greetingTypes, helpSelectors, parseCommand, renderHelp } from "../dist/commands.js";
import { Dispatcher } from "../dist/dispatcher.js";
import { PrivateReplies } from "../dist/replies.js";
import { ApiClientError } from "../dist/api-client.js";
import { config, logs, message } from "./helpers.mjs";

const examples = {
  p: ["clip"],
  pr: [],
  raid: ["clip", "3"],
  list: [],
  upload: [],
  help: ["kb"],
  setgreeting: ["clip", "file"],
  getgreeting: [],
  delgreeting: [],
  setfarewell: ["clip"],
  getfarewell: [],
  delfarewell: [],
  newplaylist: ["playlist1"],
  delplaylist: ["playlist1"],
  addtoplaylist: ["playlist1", "track"],
  delfromplaylist: ["playlist1", "track"],
  addplayliststo: ["track", "playlist1"],
  delplaylistsfrom: ["track", "playlist1"],
};
test("registry contains exactly all 18 accepted names; help derives actual implementation status", () => {
  assert.deepEqual(commands.map((item) => item.name).sort(), Object.keys(examples).sort());
  assert.equal(commandRegistry.size, 18);
  assert.deepEqual(
    commands.filter((item) => item.execute).map((item) => item.name),
    [
      "p",
      "pr",
      "raid",
      "help",
      "newplaylist",
      "delplaylist",
      "addtoplaylist",
      "delfromplaylist",
      "addplayliststo",
      "delplaylistsfrom",
    ],
  );
  const help = renderHelp("prefix");
  for (const entry of commands)
    assert.ok(help.includes(`${entry.name} — ${entry.execute ? "implemented" : "not implemented"}`));
  assert.ok(help.includes("allcats or all are ordinary names"));
});

for (const [command, tokens] of Object.entries(examples)) {
  test(`${command}: positive tokens, case/whitespace, guild and DM validity, no fabricated success`, async () => {
    assert.deepEqual(parseCommand(`  kb  ${command.toUpperCase()} ! \t ${tokens.join("  ").toUpperCase()}  `, "kb"), {
      command,
      tokens,
    });
    const cfg = config();
    const { log, records } = logs();
    const api = {
      request() {
        throw new Error("No API operation should run in this parser test");
      },
    };
    const calls = [];
    const playback = {
      async play(request) {
        calls.push(request);
        return "Playback completed.";
      },
    };
    if (
      ["newplaylist", "delplaylist", "addtoplaylist", "delfromplaylist", "addplayliststo", "delplaylistsfrom"].includes(
        command,
      )
    )
      return;
    for (const guildId of [null, "3334567890123456789"]) {
      const replies = new PrivateReplies(cfg, log);
      const dispatcher = new Dispatcher(cfg, api, replies, log, undefined, Date.now, playback);
      const event = message(`kb${command}!${tokens.join(" ")}`, { guildId });
      await dispatcher.handle(event.event);
      const response = event.dms.map((payload) => payload.content).join("");
      if (command === "help") assert.match(response, /Implemented: .*newplaylist/);
      else if (!guildId && ["p", "pr", "raid"].includes(command)) assert.match(response, /requires a guild/);
      else if (["p", "pr", "raid"].includes(command)) assert.equal(response, "Playback completed.");
      else assert.match(response, /registered but not implemented/);
      assert.equal(event.publicReplies.length, 0);
      dispatcher.close();
      replies.close();
    }
    assert.equal(
      records.filter((entry) => entry.event === "command.completed" && command !== "help").length,
      ["p", "pr", "raid"].includes(command) ? 1 : 0,
    );
    assert.equal(calls.length, ["p", "pr", "raid"].includes(command) ? 1 : 0);
  });
}

test("typed sources cannot shadow playlist names, and allcats/all remain ordinary names", () => {
  for (const selector of helpSelectors) assert.doesNotThrow(() => commandRegistry.get("help").validate([selector]));
  for (const [alias, type] of Object.entries(greetingTypes))
    assert.equal(commandRegistry.get("setgreeting").validate(["clip", alias]).greetingType, type);
  for (const name of ["all", "allcats", "mostplayed", "playhistory", "uploadhistory"])
    assert.deepEqual(commandRegistry.get("pr").validate([name]).pool, { type: "playlist", name });
  assert.deepEqual(commandRegistry.get("pr").validate([]).pool, { type: "all_tracks" });
  assert.deepEqual(commandRegistry.get("pr").validate(["source:most_played"]).pool, { type: "most_played" });
  assert.equal(commandRegistry.get("pr").validate(["source:most_played", "100"]).limit, 100);
  assert.deepEqual(commandRegistry.get("pr").validate(["playlist:allcats"]).pool, {
    type: "playlist",
    name: "allcats",
  });
  assert.doesNotThrow(() => commandRegistry.get("newplaylist").validate(["allcats"]));
  for (const obsolete of ["newcategory", "delcategory", "addtocat", "delfromcat", "addcatsto", "delcatsfrom"])
    assert.equal(commandRegistry.has(obsolete), false);
});

test("playback commands pass voice context to the playback service", async () => {
  const cfg = config();
  const { log } = logs();
  const replies = new PrivateReplies(cfg, log);
  const calls = [];
  const playback = {
    async play(request) {
      calls.push(request);
      return "Finished playing clip.";
    },
  };
  const dispatcher = new Dispatcher(cfg, {}, replies, log, undefined, Date.now, playback);
  const exact = message("kbp!clip");
  await dispatcher.handle(exact.event);
  assert.match(exact.dms[0].content, /Finished playing/);
  assert.deepEqual(calls[0], {
    kind: "play",
    trackName: "clip",
    actorDiscordId: exact.event.author.id,
    guildId: exact.event.guildId,
    voiceChannelId: exact.event.member.voice.channelId,
  });
  dispatcher.close();
  replies.close();
});

test("missing/extra/malformed arguments and unsupported typed sources give usage", async () => {
  for (const entry of commands) {
    const args = examples[entry.name];
    if (args.length) assert.throws(() => entry.validate([]));
    assert.throws(() => entry.validate(Array(101).fill("unexpected")));
  }
  for (const text of ["kbhelp", "kbhelp!kb!extra", "kb!kb", "kbhelp!".padEnd(2001, "x")])
    assert.throws(() => parseCommand(text, "kb"));
  for (const tokens of [
    ["source:most_played", "0"],
    ["source:play_history", "101"],
    ["source:upload_history", "1.5"],
    ["source:most_played", "-1"],
    ["source:all_tracks", "2"],
    ["source:unsupported"],
    ["playlist:"],
  ])
    assert.throws(() => commandRegistry.get("list").validate(tokens));
  assert.throws(() => commandRegistry.get("setgreeting").validate(["clip", "other"]));
  assert.throws(() => commandRegistry.get("setgreeting").validate(["clip", "category"]));
  assert.throws(() => commandRegistry.get("raid").validate(["clip", "0"]));
  assert.doesNotThrow(() => commandRegistry.get("newplaylist").validate(["a".repeat(45)]));
  assert.throws(() => commandRegistry.get("newplaylist").validate(["a".repeat(46)]));
  const cfg = config();
  const { log } = logs();
  const replies = new PrivateReplies(cfg, log);
  const dispatcher = new Dispatcher(cfg, {}, replies, log);
  for (const text of ["kbhelp!wrong", "kbhelp!", "kbp!", "kbgetgreeting!extra", "kbunknown!"]) {
    const event = message(text);
    await dispatcher.handle(event.event);
    assert.ok(event.dms.length > 0);
  }
  dispatcher.close();
  replies.close();
});

test("ignore other prefixes/bots/webhooks/invalid identity and bound admission/deduplicate IDs", async () => {
  const cfg = config({ MAX_CONCURRENT_COMMANDS: "1" });
  const { log } = logs();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const replies = new PrivateReplies(cfg, log);
  const dispatcher = new Dispatcher(cfg, {}, replies, log);
  const first = message("kbhelp!kb", { send: async () => gate });
  const running = dispatcher.handle(first.event);
  await Promise.resolve();
  const busy = message("kbhelp!kb", { authorId: "2234567890123456789" });
  await dispatcher.handle(busy.event);
  assert.equal(busy.dms.length, 0);
  release();
  await running;
  for (const event of [
    first,
    message("otherhelp!kb"),
    message("kbhelp!kb", { bot: true }),
    message("kbhelp!kb", { authorId: "0" }),
    message("kbhelp!kb", { event: { webhookId: "webhook" } }),
  ]) {
    await dispatcher.handle(event.event);
    assert.equal(event.dms.length, 0);
  }
  dispatcher.close();
  replies.close();
});

test("API errors use useful static private responses without echoing remote error text", async () => {
  const cfg = config();
  const { log, records } = logs();
  const replies = new PrivateReplies(cfg, log);
  const registry = new Map([
    [
      "list",
      {
        ...commandRegistry.get("list"),
        execute() {
          throw new ApiClientError("unavailable", 500, true);
        },
      },
    ],
  ]);
  const dispatcher = new Dispatcher(cfg, {}, replies, log, registry);
  const event = message("kblist!");
  await dispatcher.handle(event.event);
  assert.match(event.dms[0].content, /did not confirm this change/);
  assert.equal(event.publicReplies.length, 0);
  assert.ok(records.some((entry) => entry.event === "command.failed"));
  dispatcher.close();
  replies.close();
});

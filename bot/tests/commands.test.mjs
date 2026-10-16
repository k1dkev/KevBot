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
  newcategory: ["cat1"],
  delcategory: ["cat1"],
  addtocat: ["cat1", "clip"],
  delfromcat: ["cat1", "clip"],
  addcatsto: ["clip", "cat1"],
  delcatsfrom: ["clip", "cat1"],
};
test("registry contains exactly all 18 accepted names; help derives actual implementation status", () => {
  assert.deepEqual(commands.map((item) => item.name).sort(), Object.keys(examples).sort());
  assert.equal(commandRegistry.size, 18);
  assert.deepEqual(
    commands.filter((item) => item.execute).map((item) => item.name),
    ["help"],
  );
  const help = renderHelp("prefix");
  for (const entry of commands)
    assert.ok(help.includes(`${entry.name} — ${entry.execute ? "implemented" : "not implemented"}`));
  assert.ok(help.includes("allcats is an ordinary category"));
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
        throw new Error("No command API operation is implemented");
      },
    };
    for (const guildId of [null, "3334567890123456789"]) {
      const replies = new PrivateReplies(cfg, log);
      const dispatcher = new Dispatcher(cfg, api, replies, log);
      const event = message(`kb${command}!${tokens.join(" ")}`, { guildId });
      await dispatcher.handle(event.event);
      const response = event.dms.map((payload) => payload.content).join("");
      if (command === "help") assert.match(response, /Only help is implemented/);
      else if (!guildId && ["p", "pr", "raid"].includes(command)) assert.match(response, /requires a guild/);
      else assert.match(response, /registered but not implemented/);
      assert.equal(event.publicReplies.length, 0);
      dispatcher.close();
      replies.close();
    }
    assert.equal(records.filter((entry) => entry.event === "command.completed" && command !== "help").length, 0);
  });
}

test("all help selectors and greeting/pool aliases normalize; allcats stays an ordinary name", () => {
  for (const selector of helpSelectors) assert.doesNotThrow(() => commandRegistry.get("help").validate([selector]));
  for (const [alias, type] of Object.entries(greetingTypes))
    assert.equal(commandRegistry.get("setgreeting").validate(["clip", alias]).greetingType, type);
  for (const pool of [
    "all",
    "categories",
    "cats",
    "emptycats",
    "mostplayed",
    "myuploads",
    "playhistory",
    "uploadhistory",
    "ordinary",
    "allcats",
  ]) {
    const parsed = commandRegistry.get("list").validate([pool]);
    assert.equal(parsed.pool, pool === "cats" ? "categories" : pool);
    assert.equal(parsed.limit, ["mostplayed", "playhistory", "uploadhistory"].includes(pool) ? 25 : undefined);
  }
  assert.equal(commandRegistry.get("pr").validate(["mostplayed", "100"]).limit, 100);
  assert.doesNotThrow(() => commandRegistry.get("newcategory").validate(["allcats"]));
});

test("pending playback commands do not require voice-state data before playback is implemented", async () => {
  const cfg = config();
  const { log } = logs();
  const replies = new PrivateReplies(cfg, log);
  const dispatcher = new Dispatcher(cfg, {}, replies, log);
  for (const command of ["p", "pr"]) {
    const event = message(`kb${command}!clip`, { event: { member: {} } });
    await dispatcher.handle(event.event);
    assert.match(event.dms[0].content, /registered but not implemented/);
  }
  dispatcher.close();
  replies.close();
});

test("missing/extra/malformed arguments, invalid lengths and protected category names give usage", async () => {
  for (const entry of commands) {
    const args = examples[entry.name];
    if (args.length) assert.throws(() => entry.validate([]));
    assert.throws(() => entry.validate(Array(101).fill("unexpected")));
  }
  for (const text of ["kbhelp", "kbhelp!kb!extra", "kb!kb", "kbhelp!".padEnd(2001, "x")])
    assert.throws(() => parseCommand(text, "kb"));
  for (const tokens of [
    ["mostplayed", "0"],
    ["playhistory", "101"],
    ["uploadhistory", "1.5"],
    ["mostplayed", "-1"],
    ["all", "2"],
  ])
    assert.throws(() => commandRegistry.get("list").validate(tokens));
  for (const pool of ["cats", "categories", "emptycats"])
    assert.throws(() => commandRegistry.get("pr").validate([pool]));
  for (const pool of [
    "categories",
    "cats",
    "emptycats",
    "all",
    "mostplayed",
    "myuploads",
    "playhistory",
    "uploadhistory",
  ])
    assert.throws(() => commandRegistry.get("delcategory").validate([pool]));
  assert.throws(() => commandRegistry.get("setgreeting").validate(["clip", "other"]));
  assert.throws(() => commandRegistry.get("raid").validate(["clip", "0"]));
  assert.doesNotThrow(() => commandRegistry.get("newcategory").validate(["a".repeat(45)]));
  assert.throws(() => commandRegistry.get("newcategory").validate(["a".repeat(46)]));
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

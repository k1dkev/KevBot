import assert from "node:assert/strict";
import { test } from "node:test";
import { PrivateReplies, publicDmNotice, splitReply } from "../dist/replies.js";
import { config, logs, message } from "./helpers.mjs";

test("split replies preserve text/Unicode and stay at 2000 characters with a fixed page budget", () => {
  for (const text of ["x".repeat(6000), "line 😀\n".repeat(600), "x".repeat(1999) + "😀" + "y".repeat(500)]) {
    const chunks = splitReply(text);
    assert.equal(chunks.join(""), text);
    assert.ok(chunks.every((chunk) => chunk.length <= 2000));
    assert.ok(chunks.every((chunk) => !/[\uD800-\uDBFF]$/.test(chunk)));
  }
  assert.throws(() => splitReply("x".repeat(16001)));
  assert.throws(() => splitReply("x", 2001));
});

test("closed DMs stop at first failure, never leak content publicly, and cool down without flooding", async () => {
  for (const guildId of [null, "3334567890123456789"]) {
    let attempts = 0;
    const cfg = config();
    const { log, records } = logs();
    let now = 1000;
    const replies = new PrivateReplies(cfg, log, () => now);
    const event = message("kbhelp!kb", {
      guildId,
      send: async () => {
        attempts++;
        throw new Error("private-token-canary");
      },
    });
    assert.equal(await replies.send(event.event, "secret-response-canary".repeat(150)), false);
    await replies.send(event.event, "again");
    assert.equal(attempts, 1);
    assert.equal(event.publicReplies.length, guildId ? 1 : 0);
    if (guildId) {
      assert.equal(event.publicReplies[0].content, publicDmNotice);
      assert.deepEqual(event.publicReplies[0].allowedMentions, { parse: [], repliedUser: false });
    }
    assert.doesNotMatch(JSON.stringify([...event.publicReplies, ...records]), /canary/);
    now += cfg.DM_FAILURE_COOLDOWN_MS + 1;
    await replies.send(event.event, "again");
    assert.equal(attempts, 2);
    replies.close();
  }
});

test("sequential sends stop after a later page failure and public failure is contained", async () => {
  const { log } = logs();
  const replies = new PrivateReplies(config(), log);
  let calls = 0;
  const received = [];
  const event = message("kbhelp!kb", {
    send: async (payload) => {
      received.push(payload);
      if (++calls === 2) throw new Error("closed");
    },
    reply: async () => {
      throw new Error("no public permission");
    },
  });
  assert.equal(await replies.send(event.event, "x".repeat(6000)), false);
  assert.equal(calls, 2);
  assert.deepEqual(received[0].allowedMentions.parse, []);
  replies.close();
});

test("hanging Discord sends and shutdown are bounded with no retry", async () => {
  const { log } = logs();
  const replies = new PrivateReplies(config(), log);
  let attempts = 0;
  const event = message("kbhelp!kb", {
    guildId: null,
    send: () => {
      attempts++;
      return new Promise(() => {});
    },
  });
  assert.equal(await replies.send(event.event, "private"), false);
  assert.equal(attempts, 1);
  replies.close();
  assert.equal(await replies.send(event.event, "private"), false);
});

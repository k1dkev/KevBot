import { readConfig } from "../dist/config.js";
export const actorId = "1234567890123456789";
export const otherActorId = "2234567890123456789";
export function config(overrides = {}) {
  return readConfig({
    NODE_ENV: "test",
    DISCORD_BOT_TOKEN: "synthetic-discord-token",
    BOT_AUTH_API_KEY: "synthetic-api-key",
    API_BASE_URL: "http://api.test",
    LOG_LEVEL: "silent",
    COMMAND_COOLDOWN_MS: "0",
    API_REQUEST_TIMEOUT_MS: "100",
    DISCORD_REQUEST_TIMEOUT_MS: "50",
    DISCORD_LOGIN_TIMEOUT_MS: "50",
    ...overrides,
  });
}
export function logs() {
  const records = [];
  const logger = (bindings = {}) =>
    Object.assign(
      Object.fromEntries(
        ["debug", "info", "warn", "error"].map((level) => [
          level,
          (fields, event) => records.push({ ...bindings, ...fields, event, level }),
        ]),
      ),
      { child: (fields) => logger({ ...bindings, ...fields }) },
    );
  return { log: logger(), records };
}
let sequence = 0;
export function message(content, options = {}) {
  const dms = [],
    publicReplies = [];
  const event = {
    id: String(++sequence),
    content,
    guildId: options.guildId === undefined ? "3334567890123456789" : options.guildId,
    author: {
      id: options.authorId ?? actorId,
      bot: options.bot ?? false,
      send:
        options.send ??
        (async (payload) => {
          dms.push(payload);
        }),
    },
    member: { voice: { channelId: "4444567890123456789" } },
    reply:
      options.reply ??
      (async (payload) => {
        publicReplies.push(payload);
      }),
    ...options.event,
  };
  return { event, dms, publicReplies };
}
export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
export const grant = (token = "actor-token", id = actorId, expires = 60) => ({
  access_token: token,
  token_type: "Bearer",
  expires_in: expires,
  role: "bot",
  user: { id: 12, discord_id: id, discord_username: "synthetic" },
});
export const serviceGrant = (token = "service-token") => ({
  access_token: token,
  token_type: "Bearer",
  expires_in: 60,
  role: "bot",
});

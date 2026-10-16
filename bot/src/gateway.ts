import { Client, Events, GatewayIntentBits, Partials, type Message } from "discord.js";
import type { BotConfig } from "./config.js";
import { BotApiClient } from "./api-client.js";
import { Dispatcher } from "./dispatcher.js";
import type { BotLogger } from "./logging.js";
import { bounded, PrivateReplies } from "./replies.js";

export function createDiscordClient(config: BotConfig): Client {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
    allowedMentions: { parse: [], repliedUser: false },
    // No automatic message retry after an unknown send outcome or unbounded rate-limit queue.
    rest: { timeout: config.DISCORD_REQUEST_TIMEOUT_MS, retries: 0, rejectOnRateLimit: () => true },
  });
}

export async function startGateway(
  config: BotConfig,
  log: BotLogger,
  options: {
    client?: Pick<Client, "on" | "off" | "login" | "destroy">;
    api?: BotApiClient;
    onFatal?: () => void;
    signal?: AbortSignal;
  } = {},
) {
  const client = options.client ?? createDiscordClient(config);
  const api = options.api ?? new BotApiClient(config, log);
  const replies = new PrivateReplies(config, log);
  const dispatcher = new Dispatcher(config, api, replies, log);
  let closed = false;
  let stopping: Promise<void> | undefined;
  const message = (event: Message) => {
    void dispatcher
      .handle(event)
      .catch(() => log.error({ component: "gateway", reason: "dispatch_failed" }, "gateway.dispatch.failed"));
  };
  const ready = () => log.info({ component: "gateway" }, "gateway.ready");
  const error = () => log.warn({ component: "gateway", reason: "discord_failure" }, "gateway.error");
  const invalidated = () => {
    void stop().finally(() => options.onFatal?.());
  };
  const interrupted = () => {
    void stop();
  };
  const stop = (): Promise<void> => {
    if (stopping) return stopping;
    closed = true;
    dispatcher.close();
    replies.close();
    api.close();
    client.off(Events.MessageCreate, message);
    client.off(Events.ClientReady, ready);
    client.off(Events.Error, error);
    client.off(Events.ShardError, error);
    client.off(Events.Invalidated, invalidated);
    options.signal?.removeEventListener("abort", interrupted);
    stopping = bounded(
      Promise.resolve().then(() => client.destroy()),
      config.DISCORD_REQUEST_TIMEOUT_MS,
    ).catch(() => {
      log.warn({ component: "gateway", reason: "shutdown_failed" }, "gateway.shutdown.failed");
    });
    return stopping;
  };
  client.on(Events.MessageCreate, message);
  client.on(Events.ClientReady, ready);
  client.on(Events.Error, error);
  client.on(Events.ShardError, error);
  client.on(Events.Invalidated, invalidated);
  options.signal?.addEventListener("abort", interrupted, { once: true });
  try {
    if (options.signal?.aborted) throw new Error("Discord startup canceled");
    await bounded(client.login(config.DISCORD_BOT_TOKEN), config.DISCORD_LOGIN_TIMEOUT_MS, options.signal);
    if (closed) throw new Error("Discord session stopped during login");
  } catch {
    await stop();
    throw new Error("Discord login failed or timed out");
  }
  return { stop };
}

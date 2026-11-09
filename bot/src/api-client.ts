import { createApiClient, ApiClientError } from "@kevbot/api-client";
import type { ApiMethod } from "@kevbot/api-client";
import { z } from "zod";
import type { BotConfig } from "./config.js";
import type { BotLogger } from "./logging.js";

export { ApiClientError };

export const discordIdSchema = z.string().regex(/^[1-9]\d{16,19}$/);
const tokenSchema = z.object({
  access_token: z.string().min(1).max(16384),
  token_type: z.literal("Bearer"),
  expires_in: z.number().int().positive().max(86400),
  role: z.literal("bot"),
});
const actorSchema = tokenSchema.extend({
  user: z.object({ id: z.number().int().positive(), discord_id: discordIdSchema }).passthrough(),
});
type Token = { value: string; expiresAt: number };
export type ApiFailure =
  "auth" | "denied" | "not_found" | "invalid" | "unavailable" | "timeout" | "protocol" | "busy" | "closed";
export interface ApiRequest<T> {
  method?: ApiMethod;
  json?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  schema: z.ZodType<T>;
  signal?: AbortSignal;
}

function parseSchema<T>(schema: z.ZodType<T>): (value: unknown) => T {
  return (value) => {
    const result = schema.safeParse(value);
    if (!result.success) throw new Error("Invalid API response");
    return result.data;
  };
}

function authFailure(error: unknown): never {
  if (error instanceof ApiClientError) {
    if (error.kind === "protocol" || (error.status !== undefined && error.status >= 400))
      throw new ApiClientError("auth", error.status);
  }
  throw error;
}

export class BotApiClient {
  private serviceToken?: Token;
  private serviceFlight?: Promise<Token>;
  private readonly actors = new Map<string, Token>();
  private readonly actorFlights = new Map<string, Promise<Token>>();
  private readonly transport;

  constructor(
    private readonly config: BotConfig,
    log: BotLogger,
    fetcher: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {
    this.transport = createApiClient({
      baseUrl: config.API_BASE_URL,
      fetch: fetcher,
      timeoutMs: config.API_REQUEST_TIMEOUT_MS,
      maxResponseBytes: config.API_MAX_RESPONSE_BYTES,
      maxConcurrentRequests: config.API_MAX_CONCURRENT_REQUESTS,
      requestIdHeader: true,
      onRequest: ({ requestId, status, durationMs, kind }) => {
        if (kind) log.warn({ component: "api", requestId, reason: kind, status }, "api.request.failed");
        else log.debug({ component: "api", requestId, status, durationMs }, "api.request.completed");
      },
    });
  }

  close() {
    this.transport.close();
    this.serviceToken = undefined;
    this.actors.clear();
    this.actorFlights.clear();
  }

  private fresh(token?: Token) {
    return token && token.expiresAt > this.now() ? token : undefined;
  }

  private token(data: z.infer<typeof tokenSchema>): Token {
    const ttl = data.expires_in * 1000;
    return { value: data.access_token, expiresAt: this.now() + ttl - Math.min(5000, ttl / 10) };
  }

  private async service(rejected?: Token): Promise<Token> {
    if (this.serviceToken === rejected) this.serviceToken = undefined;
    const cached = this.fresh(this.serviceToken);
    if (cached) return cached;
    if (this.serviceFlight) return this.serviceFlight;
    this.serviceFlight = (async () => {
      let grant: z.infer<typeof tokenSchema>;
      try {
        grant = await this.transport.request("/v1/bot/auth", {
          method: "POST",
          headers: { "x-bot-key": this.config.BOT_AUTH_API_KEY },
          parse: parseSchema(tokenSchema),
        });
      } catch (error) {
        authFailure(error);
      }
      const token = this.token(grant);
      this.serviceToken = token;
      return token;
    })();
    try {
      return await this.serviceFlight;
    } finally {
      this.serviceFlight = undefined;
    }
  }

  private async resolveActor(discordId: string, serviceToken: Token): Promise<z.infer<typeof actorSchema>> {
    return this.transport.request("/v1/bot/actors/resolve", {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceToken.value}` },
      json: { discord_id: discordId },
      parse: parseSchema(actorSchema),
    });
  }

  private async actor(discordId: string, rejected?: Token): Promise<Token> {
    if (this.actors.get(discordId) === rejected) this.actors.delete(discordId);
    const cached = this.fresh(this.actors.get(discordId));
    if (cached) {
      this.actors.delete(discordId);
      this.actors.set(discordId, cached);
      return cached;
    }
    const pending = this.actorFlights.get(discordId);
    if (pending) return pending;
    if (this.actorFlights.size >= this.config.ACTOR_CACHE_MAX) throw new ApiClientError("busy");

    const flight = (async () => {
      let service = await this.service();
      let grant: z.infer<typeof actorSchema>;
      try {
        grant = await this.resolveActor(discordId, service);
      } catch (error) {
        if (!(error instanceof ApiClientError) || error.status !== 401) authFailure(error);
        service = await this.service(service);
        try {
          grant = await this.resolveActor(discordId, service);
        } catch (retryError) {
          authFailure(retryError);
        }
      }
      if (grant.user.discord_id !== discordId) throw new ApiClientError("auth");
      const token = this.token(grant);
      this.actors.delete(discordId);
      while (this.actors.size >= this.config.ACTOR_CACHE_MAX) this.actors.delete(this.actors.keys().next().value!);
      this.actors.set(discordId, token);
      return token;
    })();
    this.actorFlights.set(discordId, flight);
    try {
      return await flight;
    } finally {
      this.actorFlights.delete(discordId);
    }
  }

  async request<T>(authorDiscordId: string, path: string, options: ApiRequest<T>): Promise<T> {
    if (
      !discordIdSchema.safeParse(authorDiscordId).success ||
      !/^\/v1\/(?!bot(?:\/|$))[^%?#\\]*$/.test(path) ||
      path.includes("..") ||
      path.includes("://")
    )
      throw new ApiClientError("invalid");
    const execute = (token: Token) =>
      this.transport.request(path, {
        method: options.method,
        query: options.query,
        json: options.json,
        signal: options.signal,
        headers: { Authorization: `Bearer ${token.value}` },
        parse: parseSchema(options.schema),
      });
    let token = await this.actor(authorDiscordId);
    try {
      return await execute(token);
    } catch (error) {
      if (!(error instanceof ApiClientError) || error.status !== 401) throw error;
      token = await this.actor(authorDiscordId, token);
      return execute(token);
    }
  }

  async requestAudio(authorDiscordId: string, path: string): Promise<Buffer> {
    if (
      !discordIdSchema.safeParse(authorDiscordId).success ||
      !/^\/v1\/(?!bot(?:\/|$))[^%?#\\]*$/.test(path) ||
      path.includes("..") ||
      path.includes("://")
    )
      throw new ApiClientError("invalid");
    let token = await this.actor(authorDiscordId);
    const execute = (access: Token) =>
      this.transport.requestBytes(path, {
        headers: { Authorization: `Bearer ${access.value}` },
        accept: "audio/mpeg",
        expectedContentType: /^audio\/mpeg(?:\s*;|$)/i,
      });
    try {
      return Buffer.from(await execute(token));
    } catch (error) {
      if (!(error instanceof ApiClientError) || error.status !== 401) throw error;
      token = await this.actor(authorDiscordId, token);
      return Buffer.from(await execute(token));
    }
  }
}

export function apiUserMessage(error: ApiClientError): string {
  if (error.outcomeUnknown)
    return "The API did not confirm this change. Check its state before trying again; it was not automatically retried.";
  switch (error.kind) {
    case "auth":
      return "Bot authentication failed. Please contact the operator.";
    case "denied":
      return "The API denied this operation for your account.";
    case "not_found":
      return "The requested item is unavailable or deleted.";
    case "invalid":
      return "The API rejected the request. Check the command usage.";
    case "busy":
      return "The bot is busy. Try again shortly.";
    default:
      return "The API is unavailable or timed out. Please try again later.";
  }
}

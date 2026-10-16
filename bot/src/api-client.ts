import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { BotConfig } from "./config.js";
import type { BotLogger } from "./logging.js";

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
type Method = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE";
export type ApiFailure =
  "auth" | "denied" | "not_found" | "invalid" | "unavailable" | "timeout" | "protocol" | "busy" | "closed";
export class ApiClientError extends Error {
  constructor(
    readonly kind: ApiFailure,
    readonly status?: number,
    readonly outcomeUnknown = false,
  ) {
    super(`Bot API request failed: ${kind}`);
  }
}
export interface ApiRequest<T> {
  method?: Method;
  json?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  schema: z.ZodType<T>;
  signal?: AbortSignal;
}

// Only API service/actor JWTs are cached, never a catalog, database connection or audio objects.
export class BotApiClient {
  private serviceToken?: Token;
  private serviceFlight?: Promise<Token>;
  private readonly actors = new Map<string, Token>();
  private readonly actorFlights = new Map<string, Promise<Token>>();
  private readonly shutdown = new AbortController();
  private active = 0;

  constructor(
    private readonly config: BotConfig,
    private readonly log: BotLogger,
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  close() {
    this.shutdown.abort();
    this.serviceToken = undefined;
    this.actors.clear();
    this.actorFlights.clear();
  }
  private fresh(token?: Token) {
    return token && token.expiresAt > this.now() ? token : undefined;
  }
  private token(data: z.infer<typeof tokenSchema>): Token {
    // Short-lived test/dev grants still receive a proportional safety margin.
    const ttl = data.expires_in * 1000;
    return { value: data.access_token, expiresAt: this.now() + ttl - Math.min(5000, ttl / 10) };
  }

  private async raw(
    path: string,
    method: Method,
    headers: Record<string, string>,
    json?: unknown,
    signal?: AbortSignal,
  ): Promise<{ status: number; body: unknown }> {
    if (this.shutdown.signal.aborted || signal?.aborted) throw new ApiClientError("closed");
    if (this.active >= this.config.API_MAX_CONCURRENT_REQUESTS) throw new ApiClientError("busy");
    this.active++;
    const controller = new AbortController();
    const combined = AbortSignal.any([controller.signal, this.shutdown.signal, ...(signal ? [signal] : [])]);
    const requestId = randomUUID();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = this.now();
    const mutating = method !== "GET" && method !== "HEAD";
    let responseStatus: number | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const operation = async () => {
        const response = await this.fetcher(`${this.config.API_BASE_URL.replace(/\/$/, "")}${path}`, {
          method,
          headers: {
            ...headers,
            "X-Request-ID": requestId,
            ...(json === undefined ? {} : { "Content-Type": "application/json" }),
          },
          ...(json === undefined ? {} : { body: JSON.stringify(json) }),
          redirect: "error",
          signal: combined,
        });
        responseStatus = response.status;
        // Error bodies may contain private data; never read or relay them.
        if (!response.ok) {
          await response.body?.cancel();
          return { status: response.status, body: undefined };
        }
        const declaredSize = Number(response.headers.get("content-length") ?? 0);
        if (declaredSize > this.config.API_MAX_RESPONSE_BYTES) {
          await response.body?.cancel();
          throw new ApiClientError("protocol", response.status, mutating);
        }
        if (response.status === 204 || method === "HEAD") {
          await response.body?.cancel();
          return { status: response.status, body: undefined };
        }
        reader = response.body?.getReader();
        if (!reader) throw new ApiClientError("protocol", response.status, mutating);
        const chunks: Uint8Array[] = [];
        let size = 0;
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          size += next.value.byteLength;
          if (size > this.config.API_MAX_RESPONSE_BYTES)
            throw new ApiClientError("protocol", response.status, mutating);
          chunks.push(next.value);
        }
        const text = Buffer.concat(chunks).toString("utf8");
        try {
          return { status: response.status, body: JSON.parse(text) as unknown };
        } catch {
          throw new ApiClientError("protocol", response.status, mutating);
        }
      };
      const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new ApiClientError("timeout", responseStatus, mutating));
        }, this.config.API_REQUEST_TIMEOUT_MS);
      });
      const aborted = new Promise<never>((_resolve, reject) => {
        combined.addEventListener(
          "abort",
          () =>
            reject(
              new ApiClientError(
                this.shutdown.signal.aborted || signal?.aborted ? "closed" : "timeout",
                responseStatus,
                mutating,
              ),
            ),
          { once: true },
        );
      });
      const result = await Promise.race([operation(), deadline, aborted]);
      this.log.debug(
        { component: "api", requestId, status: result.status, durationMs: this.now() - started },
        "api.request.completed",
      );
      return result;
    } catch (error) {
      const failure =
        error instanceof ApiClientError ? error : new ApiClientError("unavailable", responseStatus, mutating);
      this.log.warn(
        { component: "api", requestId, reason: failure.kind, status: failure.status },
        "api.request.failed",
      );
      throw failure;
    } finally {
      if (timer) clearTimeout(timer);
      controller.abort();
      if (reader) {
        void reader.cancel().catch(() => {});
        try {
          reader.releaseLock();
        } catch {
          /* A canceled read may still be settling. */
        }
      }
      this.active--;
    }
  }

  private async service(rejected?: Token): Promise<Token> {
    if (this.serviceToken === rejected) this.serviceToken = undefined;
    const cached = this.fresh(this.serviceToken);
    if (cached) return cached;
    if (this.serviceFlight) return this.serviceFlight;
    this.serviceFlight = (async () => {
      const result = await this.raw("/v1/bot/auth", "POST", { "x-bot-key": this.config.BOT_AUTH_API_KEY });
      const grant = tokenSchema.safeParse(result.body);
      if (result.status !== 200 || !grant.success) throw new ApiClientError("auth", result.status);
      // A service-only token is never used on an ordinary actor endpoint.
      const token = this.token(grant.data);
      if (!this.shutdown.signal.aborted) this.serviceToken = token;
      return token;
    })();
    try {
      return await this.serviceFlight;
    } finally {
      this.serviceFlight = undefined;
    }
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
      let result = await this.raw(
        "/v1/bot/actors/resolve",
        "POST",
        { Authorization: `Bearer ${service.value}` },
        { discord_id: discordId },
      );
      if (result.status === 401) {
        service = await this.service(service);
        result = await this.raw(
          "/v1/bot/actors/resolve",
          "POST",
          { Authorization: `Bearer ${service.value}` },
          { discord_id: discordId },
        );
      }
      const grant = actorSchema.safeParse(result.body);
      if (result.status !== 200 || !grant.success || grant.data.user.discord_id !== discordId)
        throw new ApiClientError("auth", result.status);
      const token = this.token(grant.data);
      if (!this.shutdown.signal.aborted) {
        this.actors.delete(discordId);
        while (this.actors.size >= this.config.ACTOR_CACHE_MAX) this.actors.delete(this.actors.keys().next().value!);
        this.actors.set(discordId, token);
      }
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
    if (this.shutdown.signal.aborted || options.signal?.aborted) throw new ApiClientError("closed");
    const query = new URLSearchParams();
    const entries = Object.entries(options.query ?? {});
    if (entries.length > 32) throw new ApiClientError("invalid");
    for (const [key, value] of entries) {
      if (!/^[a-z_]{1,40}$/.test(key) || (value !== undefined && String(value).length > 500))
        throw new ApiClientError("invalid");
      if (value !== undefined) query.set(key, String(value));
    }
    const route = path + (query.size ? `?${query}` : "");
    const method = options.method ?? "GET";
    let token = await this.actor(authorDiscordId);
    let result = await this.raw(
      route,
      method,
      { Authorization: `Bearer ${token.value}` },
      options.json,
      options.signal,
    );
    if (result.status === 401) {
      token = await this.actor(authorDiscordId, token);
      // Only an explicit authentication rejection allows this one replay, including mutations.
      result = await this.raw(route, method, { Authorization: `Bearer ${token.value}` }, options.json, options.signal);
    }
    if (result.status >= 400) {
      const kind =
        result.status === 401
          ? "auth"
          : result.status === 403
            ? "denied"
            : result.status === 404
              ? "not_found"
              : result.status < 500 && result.status !== 429
                ? "invalid"
                : "unavailable";
      throw new ApiClientError(kind, result.status, method !== "GET" && method !== "HEAD" && result.status >= 500);
    }
    const data = options.schema.safeParse(result.body);
    if (!data.success) throw new ApiClientError("protocol", result.status, method !== "GET" && method !== "HEAD");
    return data.data;
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

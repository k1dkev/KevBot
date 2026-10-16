import pino, { type DestinationStream } from "pino";
import type { BotConfig } from "./config.js";

export interface LogFields {
  component?: string;
  requestId?: string;
  command?: string;
  guildId?: string;
  status?: number;
  durationMs?: number;
  reason?: string;
  count?: number;
}
type LogMethod = (fields: LogFields, event: string) => void;
export interface BotLogger {
  debug: LogMethod;
  info: LogMethod;
  warn: LogMethod;
  error: LogMethod;
  child(fields: LogFields): BotLogger;
}
const fieldNames = new Set(["component", "requestId", "command", "guildId", "status", "durationMs", "reason", "count"]);

// Bounded metadata-only adapter: no raw Error prose, messages, bodies, URLs, tokens or config.
export function createLogger(
  config: Pick<BotConfig, "LOG_LEVEL" | "DISCORD_BOT_TOKEN" | "BOT_AUTH_API_KEY">,
  destination?: DestinationStream,
): BotLogger {
  const stream = destination ?? pino.destination({ dest: 1, sync: true });
  if ("on" in stream && typeof stream.on === "function") stream.on("error", () => {});
  const secrets = [config.DISCORD_BOT_TOKEN, config.BOT_AUTH_API_KEY].filter(Boolean);
  const clean = (fields: LogFields) =>
    Object.fromEntries(
      Object.entries(fields)
        .filter(([key]) => fieldNames.has(key))
        .map(([key, value]) => [
          key,
          typeof value === "number" && Number.isFinite(value)
            ? value
            : typeof value === "string" &&
                /^[\w.:-]{1,100}$/.test(value) &&
                !secrets.some((secret) => value.includes(secret))
              ? value
              : "[REDACTED]",
        ]),
    );
  const adapt = (sink: pino.Logger): BotLogger => {
    const log = {} as BotLogger;
    for (const level of ["debug", "info", "warn", "error"] as const)
      log[level] = (fields, event) => {
        try {
          sink[level](clean(fields), /^[a-z][a-z0-9_.]{0,80}$/.test(event) ? event : "diagnostic.invalid_event");
        } catch {
          /* Diagnostics never change an operation. */
        }
      };
    log.child = (fields) => {
      try {
        return adapt(sink.child(clean(fields)));
      } catch {
        return log;
      }
    };
    return log;
  };
  return adapt(
    pino(
      {
        level: config.LOG_LEVEL,
        base: { service: "bot", component: "runtime" },
        timestamp: pino.stdTimeFunctions.isoTime,
      },
      stream,
    ),
  );
}

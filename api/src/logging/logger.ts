import pino, { DestinationStream } from "pino";
import { adaptLogger, AppLogger, environmentSecretValues, LogLevel, parseLogLevel } from "./safety";

export function environmentSecrets(): string[] {
  return environmentSecretValues(process.env);
}

export function createServerLogger(
  options: {
    service?: string;
    level?: LogLevel;
    environment?: string;
    destination?: DestinationStream;
  } = {},
): AppLogger {
  const environment = options.environment ?? process.env.NODE_ENV;
  const fallback = environment === "test" ? "silent" : "info";
  let level = options.level ?? fallback;
  if (!options.level) {
    try {
      level = parseLogLevel(process.env.LOG_LEVEL, fallback);
    } catch {
      // configFactory reports invalid levels safely and retains startup exit behavior.
    }
  }
  const destination: DestinationStream =
    options.destination ??
    (environment === "development" && process.stdout.isTTY
      ? require("pino-pretty")({ sync: true, colorize: true })
      : pino.destination({ dest: 1, sync: true }));
  // In particular, an EPIPE from a closed stdout collector must not crash the service.
  if ("on" in destination && typeof destination.on === "function") destination.on("error", () => {});
  const sink = pino(
    {
      level,
      base: { service: options.service ?? "api" },
      serializers: { err: (value) => value },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    destination,
  );
  return adaptLogger(sink as AppLogger, environmentSecrets);
}

export const logger = createServerLogger();

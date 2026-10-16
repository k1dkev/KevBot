import pino from "pino/browser";
import { adaptLogger, type AppLogger, type LogLevel } from "./safety";

export function createBrowserLogger(
  level: LogLevel = process.env.NODE_ENV === "production" ? "warn" : "debug",
): AppLogger {
  return adaptLogger(
    pino({
      level,
      browser: { asObject: true },
    }).child({ service: "frontend", component: "browser" }) as AppLogger,
  );
}

// No public logging env variables, server imports, transmit hook or network sink.
export const logger = createBrowserLogger();

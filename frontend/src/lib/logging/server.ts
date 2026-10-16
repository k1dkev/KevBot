import "server-only";
import pino from "pino";
import { randomUUID } from "node:crypto";
import { adaptLogger, type AppLogger, environmentSecretValues, parseLogLevel } from "./safety";

const environment = process.env.NODE_ENV;
const destination = pino.destination({ dest: 1, sync: true });
destination.on("error", () => {});
export const logger = adaptLogger(
  pino(
    {
      level: parseLogLevel(process.env.LOG_LEVEL, environment === "test" ? "silent" : "info"),
      base: { service: "frontend", component: "server" },
      serializers: { err: (value) => value },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    destination,
  ) as AppLogger,
  () => environmentSecretValues(process.env),
);

export function logRequestError(err: unknown, method: string, route: string) {
  logger.child({ requestId: randomUUID() }).error({ err, method, route }, "server.request.failed");
}

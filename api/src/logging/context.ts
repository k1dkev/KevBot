import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { logger } from "./logger";
import type { AppLogger } from "./safety";

export const logContext = new AsyncLocalStorage<AppLogger>();
export const getLogger = () => logContext.getStore() ?? logger;

export function withJobLogger<T>(job: string, run: (log: AppLogger) => T): T {
  const log = getLogger().child({ component: "jobs", job, jobId: randomUUID() });
  return logContext.run(log, () => run(log));
}

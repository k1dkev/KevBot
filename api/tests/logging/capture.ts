import { createServerLogger } from "../../src/logging/logger";

export function capture(level: "debug" | "info" | "warn" | "silent" = "info") {
  const records: Record<string, any>[] = [];
  const log = createServerLogger({
    environment: "production",
    level,
    destination: {
      write: (line: string) => {
        records.push(JSON.parse(line));
      },
    },
  });
  return { log, records };
}

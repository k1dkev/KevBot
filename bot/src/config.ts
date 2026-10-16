import { z } from "zod";

export const levels = ["trace", "debug", "info", "warn", "error", "fatal", "silent"] as const;
const boundedInt = (fallback: number, min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).default(fallback);
const configSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DISCORD_BOT_TOKEN: z.string().trim().min(1),
  COMMAND_PREFIX: z.string().min(1).max(32).regex(/^\S+$/).default("kb"),
  API_BASE_URL: z
    .string()
    .url()
    .refine((value) => {
      try {
        const url = new URL(value);
        return (
          ["http:", "https:"].includes(url.protocol) &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash &&
          url.pathname === "/"
        );
      } catch {
        return false;
      }
    }),
  BOT_AUTH_API_KEY: z.string().trim().min(1),
  LOG_LEVEL: z.enum(levels).default("info"),
  API_REQUEST_TIMEOUT_MS: boundedInt(5000, 50, 30000),
  API_MAX_RESPONSE_BYTES: boundedInt(1048576, 256, 8388608),
  API_MAX_CONCURRENT_REQUESTS: boundedInt(8, 1, 32),
  ACTOR_CACHE_MAX: boundedInt(256, 1, 5000),
  DISCORD_REQUEST_TIMEOUT_MS: boundedInt(5000, 50, 30000),
  DISCORD_LOGIN_TIMEOUT_MS: boundedInt(15000, 50, 60000),
  DM_MAX_MESSAGES: boundedInt(8, 1, 10),
  DM_FAILURE_COOLDOWN_MS: boundedInt(60000, 100, 3600000),
  COMMAND_COOLDOWN_MS: boundedInt(1000, 0, 60000),
  MAX_CONCURRENT_COMMANDS: boundedInt(4, 1, 32),
});
export type BotConfig = z.infer<typeof configSchema>;

export class ConfigError extends Error {
  constructor(readonly fields: string[]) {
    super("Invalid bot configuration");
  }
}

export function readConfig(environment: NodeJS.ProcessEnv = process.env): BotConfig {
  // Select only this service's fields: no shared env file, DB/storage credentials or config dump.
  const result = configSchema.safeParse(
    Object.fromEntries(Object.keys(configSchema.shape).map((key) => [key, environment[key]])),
  );
  if (!result.success) throw new ConfigError([...new Set(result.error.issues.map((issue) => String(issue.path[0])))]);
  return result.data;
}

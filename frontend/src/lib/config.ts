import { z } from "zod";
import { logger } from "./logging/browser";

const frontendConfigSchema = z.object({
  apiUrl: z
    .string()
    .min(1)
    .refine(
      (val) => {
        try {
          new URL(val);
          return true;
        } catch {
          return false;
        }
      },
      {
        message: "NEXT_PUBLIC_API_URL must be a valid URL.",
      },
    ),
  frontendUrl: z
    .string()
    .min(1)
    .refine(
      (val) => {
        try {
          new URL(val);
          return true;
        } catch {
          return false;
        }
      },
      {
        message: "NEXT_PUBLIC_FRONTEND_URL must be a valid URL.",
      },
    ),
  discordOAuth2ClientId: z.string().min(1),
  discordOAuth2AuthUrl: z
    .string()
    .min(1)
    .refine(
      (val) => {
        try {
          new URL(val);
          return true;
        } catch {
          return false;
        }
      },
      {
        message: "NEXT_PUBLIC_DISCORD_OAUTH2_AUTH_URL must be a valid URL.",
      },
    ),
});

export type FrontendConfig = z.infer<typeof frontendConfigSchema>;

let cachedConfig: FrontendConfig | null = null;

export function getConfig(): FrontendConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const rawConfig = {
    apiUrl: process.env.NEXT_PUBLIC_API_URL,
    frontendUrl: process.env.NEXT_PUBLIC_FRONTEND_URL,
    discordOAuth2ClientId: process.env.NEXT_PUBLIC_DISCORD_OAUTH2_CLIENT_ID,
    discordOAuth2AuthUrl: process.env.NEXT_PUBLIC_DISCORD_OAUTH2_AUTH_URL ?? "https://discord.com/api/oauth2/authorize",
  };

  try {
    cachedConfig = frontendConfigSchema.parse(rawConfig);
    return cachedConfig;
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error(
        {
          component: "config",
          issues: error.issues.map(({ path, code }) => ({ field: path.join("."), issueType: code })),
        },
        "config.validation.failed",
      );
      throw new Error(`Frontend configuration error: ${error.errors.map((e) => e.message).join(", ")}`);
    }
    throw error;
  }
}

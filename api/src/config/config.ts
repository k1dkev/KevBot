import { z } from "zod";

const secretsSchema = z.object({
  DB_CONNECTION_STRING: z
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
        message: "DB_CONNECTION_STRING must be a valid URL.",
      },
    ),
  GCP_API_ENDPOINT: z.string().min(1),
  GCP_TRACKS_BUCKET_NAME: z.string().min(1),
  KEVBOT_API_ADDRESS: z.string().min(1),
  KEVBOT_API_JWT_SECRET: z.string().min(1),
  KEVBOT_API_PORT: z.coerce.number().int().positive(),
  BOT_AUTH_API_KEY: z.string().min(1),
  DEV_AUTH_SECRET: z.string().optional(),
  // TODO(discord-auth): review these ENV vars
  DISCORD_OAUTH2_CLIENT_ID: z.string().min(1),
  DISCORD_OAUTH2_CLIENT_SECRET: z.string().min(1),
  DISCORD_OAUTH2_REDIRECT_URI: z
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
        message: "DISCORD_OAUTH2_REDIRECT_URI must be a valid URL.",
      },
    ),
});

const configSchema = z.object({
  nodeEnv: z.string().min(1),
  maxFileSizeInBytes: z.number().int().positive(),
  maxTrackDurationInSeconds: z.number().positive(),
  maxTrackNameLength: z.number().int().positive(),
  maxPlaylistNameLength: z.number().int().positive(),
  maxUsernameLength: z.number().int().positive(),
  minPasswordLength: z.number().int().positive(),
  maxPasswordLength: z.number().int().positive(),
  supportedTrackExtensions: z.array(z.string()).nonempty(),
  acceptableIntegratedLoudnessBand: z.number(),
  acceptableDurationChangeInSeconds: z.number(),
  jwtTokenExpirationTime: z
    .string()
    .regex(/^\d+[smhd]$/, "jwtTokenExpirationTime must be a valid time string like '1h', '30m', '60s', etc."),
  expectedDbVersion: z
    .string()
    .regex(
      /^\d+\.\d+\.\d+(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/,
      "expectedDbVersion must be a valid semantic version (e.g., 2.10.0, 1.0.0-beta, etc.)",
    ),
  maxResultsPerPage: z.number().int().positive(),
  maxSearchQueryLength: z.number().int().positive(),
  authAccessTokenTtlMinutes: z.number().int().positive(),
  authRefreshTokenTtlDays: z.number().int().positive(),
  authRefreshCookieName: z.string().min(1),
  authRefreshCookiePath: z.string().min(1),
  authJwtAudience: z.string().min(1),
  authJwtIssuer: z.string().min(1),
  devRoutesEnabled: z.boolean(),
  devAuthHeader: z.string().min(1),
  botAuthHeader: z.string().min(1),
  secureCookies: z.boolean(),
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
        message: "discordOAuth2AuthUrl must be a valid URL.",
      },
    ),
});

export type Secrets = z.infer<typeof secretsSchema>;
export type Config = z.infer<typeof configSchema>;
export type AppConfig = { config: Config; secrets: Secrets };

export function configFactory(): AppConfig {
  try {
    // TODO(discord-auth): just put these directly into the config struct
    const devRoutesEnabled =
      (process.env.DEV_ROUTES_ALLOWED ?? "false").toLowerCase() === "true" &&
      (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test");
    const accessTokenTtlMinutes = Number(process.env.AUTH_ACCESS_TOKEN_TTL_MINUTES ?? "15");
    const refreshSessionTtlDays = Number(process.env.AUTH_REFRESH_SESSION_TTL_DAYS ?? "90");
    const refreshCookieName = process.env.AUTH_REFRESH_COOKIE_NAME ?? "kevbot_refresh_session";
    const refreshCookiePath = process.env.AUTH_REFRESH_COOKIE_PATH ?? "/v1/auth";
    const authJwtAudience = process.env.AUTH_JWT_AUDIENCE ?? "kevbot-api";
    const authJwtIssuer = process.env.AUTH_JWT_ISSUER ?? "kevbot-api";

    const secrets = {
      DB_CONNECTION_STRING: process.env.DB_CONNECTION_STRING,
      GCP_API_ENDPOINT: process.env.GCP_API_ENDPOINT,
      GCP_TRACKS_BUCKET_NAME: process.env.GCP_TRACKS_BUCKET_NAME,
      KEVBOT_API_ADDRESS: process.env.KEVBOT_API_ADDRESS,
      KEVBOT_API_PORT: process.env.KEVBOT_API_PORT,
      KEVBOT_API_JWT_SECRET: process.env.KEVBOT_API_JWT_SECRET,
      BOT_AUTH_API_KEY: process.env.BOT_AUTH_API_KEY,
      DEV_AUTH_SECRET: process.env.DEV_AUTH_SECRET,
      DISCORD_OAUTH2_CLIENT_ID: process.env.DISCORD_OAUTH2_CLIENT_ID,
      DISCORD_OAUTH2_CLIENT_SECRET: process.env.DISCORD_OAUTH2_CLIENT_SECRET,
      DISCORD_OAUTH2_REDIRECT_URI: process.env.DISCORD_OAUTH2_REDIRECT_URI,
    };
    const config = {
      nodeEnv: process.env.NODE_ENV,
      maxFileSizeInBytes: 3000000,
      maxTrackDurationInSeconds: 15.0,
      maxTrackNameLength: 15,
      maxPlaylistNameLength: 15,
      maxUsernameLength: 32,
      minPasswordLength: 8,
      maxPasswordLength: 64,
      supportedTrackExtensions: [".mp3"],
      jwtTokenExpirationTime: "1h",
      expectedDbVersion: "2.14.0",
      acceptableIntegratedLoudnessBand: 2.5,
      acceptableDurationChangeInSeconds: 0.01,
      maxResultsPerPage: 100,
      maxSearchQueryLength: 200,
      authAccessTokenTtlMinutes: accessTokenTtlMinutes,
      authRefreshTokenTtlDays: refreshSessionTtlDays,
      authRefreshCookieName: refreshCookieName,
      authRefreshCookiePath: refreshCookiePath,
      authJwtAudience: authJwtAudience,
      authJwtIssuer: authJwtIssuer,
      devRoutesEnabled: devRoutesEnabled,
      devAuthHeader: "x-dev-auth-secret",
      botAuthHeader: "x-bot-key",
      secureCookies: process.env.NODE_ENV === "production",
      discordOAuth2AuthUrl: process.env.DISCORD_OAUTH2_AUTH_URL ?? "https://discord.com/api/oauth2/authorize",
    };
    const validatedSecrets = secretsSchema.parse(secrets);
    const validatedConfig = configSchema.parse(config);
    if (validatedConfig.devRoutesEnabled && !validatedSecrets.DEV_AUTH_SECRET) {
      throw new Error("DEV_AUTH_SECRET must be set when dev routes are enabled");
    }
    return { config: validatedConfig, secrets: validatedSecrets };
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("Configuration validation error:", error.errors);
    } else {
      console.error("Unknown error during configuration initialization:", error);
    }
    process.exit(1);
  }
}

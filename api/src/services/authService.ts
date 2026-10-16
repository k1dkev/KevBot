import jwt, { JsonWebTokenError, NotBeforeError, TokenExpiredError } from "jsonwebtoken";
import * as Boom from "@hapi/boom";
import { randomUUID } from "crypto";
import { Config, Secrets } from "../config/config";
import { UsersService } from "./usersService";
import { KevbotDb } from "../db/connection";
import { Database } from "../db/schema";
import { Transaction } from "kysely";

const DISCORD_API_BASE_URL = "https://discord.com/api/v10";
const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";

export type AuthRole = "user" | "bot";

export interface AuthContext {
  userId?: number;
  role: AuthRole;
  sessionId?: string;
  actorDiscordId?: string;
}

interface AccessTokenBundle {
  accessToken: string;
  expiresIn: number;
  sessionId?: string;
}

interface SessionInfo {
  id: string;
  expiresAt: Date;
}

interface SessionGrant extends AccessTokenBundle {
  userId: number;
  session: SessionInfo;
}

interface DiscordProfile {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
}

interface SessionMetadata {
  userAgent?: string;
  ip?: string;
}

type DbExecutor = KevbotDb | Transaction<Database>;

function isJwtError(err: unknown): err is JsonWebTokenError | TokenExpiredError | NotBeforeError {
  return err instanceof JsonWebTokenError || err instanceof TokenExpiredError || err instanceof NotBeforeError;
}

function sanitizeUserAgent(userAgent?: string): string | null {
  if (!userAgent) {
    return null;
  }
  return userAgent.slice(0, 255);
}

function sanitizeIp(ip?: string): string | null {
  if (!ip) {
    return null;
  }
  return ip.slice(0, 45);
}

interface DiscordTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

async function exchangeDiscordCodeForToken(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<string> {
  const formData = new URLSearchParams();
  formData.append("client_id", clientId);
  formData.append("client_secret", clientSecret);
  formData.append("grant_type", "authorization_code");
  formData.append("code", code);
  formData.append("redirect_uri", redirectUri);

  let response: Response;
  try {
    response = await fetch(DISCORD_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });
  } catch (error) {
    throw Boom.badGateway("Unable to contact Discord");
  }

  if (!response.ok) {
    if (response.status === 400) {
      throw Boom.badRequest("Invalid authorization code");
    }
    throw Boom.badGateway("Failed to exchange authorization code");
  }

  const data = (await response.json()) as DiscordTokenResponse;
  if (!data.access_token) {
    throw Boom.badGateway("Discord did not return an access token");
  }

  return data.access_token;
}

async function fetchDiscordProfile(accessToken: string): Promise<DiscordProfile> {
  let response: Response;
  try {
    response = await fetch(`${DISCORD_API_BASE_URL}/users/@me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (error) {
    throw Boom.badGateway("Unable to contact Discord");
  }
  if (!response.ok) {
    if (response.status === 401) {
      throw Boom.unauthorized("Discord access token is invalid");
    }
    throw Boom.badGateway("Failed to verify Discord access token");
  }
  // TODO: do a schema validation here
  return (await response.json()) as DiscordProfile;
}

// TODO: should this just be part of the authService? Instead of a standalone function?
export async function createSession(
  executor: DbExecutor,
  config: Config,
  userId: number,
  metadata: SessionMetadata,
): Promise<SessionInfo> {
  const sessionId = randomUUID();
  const now = Date.now();
  const expiresAt = new Date(now + config.authRefreshTokenTtlDays * 24 * 60 * 60 * 1000);
  await executor
    .insertInto("sessions")
    .values({
      id: sessionId,
      user_id: userId,
      expires_at: expiresAt,
      is_revoked: 0,
      user_agent: sanitizeUserAgent(metadata.userAgent),
      ip: sanitizeIp(metadata.ip),
    })
    .execute();
  return { id: sessionId, expiresAt };
}

async function slideSession(
  executor: DbExecutor,
  config: Config,
  sessionId: string,
  metadata: SessionMetadata,
): Promise<SessionInfo> {
  const now = Date.now();
  const newExpiry = new Date(now + config.authRefreshTokenTtlDays * 24 * 60 * 60 * 1000);
  await executor
    .updateTable("sessions")
    .set({
      expires_at: newExpiry,
      user_agent: sanitizeUserAgent(metadata.userAgent),
      ip: sanitizeIp(metadata.ip),
    })
    .where("id", "=", sessionId)
    .execute();
  return { id: sessionId, expiresAt: newExpiry };
}

export function computeAccessToken(
  config: Config,
  secrets: Secrets,
  role: AuthRole,
  userId?: number,
  sessionId?: string,
  actorDiscordId?: string,
): AccessTokenBundle {
  const expiresInSeconds = config.authAccessTokenTtlMinutes * 60;

  const token = jwt.sign(
    {
      role,
      sid: sessionId,
      actor_id: role === "bot" ? userId : undefined,
      actor_discord_id: role === "bot" ? actorDiscordId : undefined,
    },
    secrets.KEVBOT_API_JWT_SECRET,
    {
      expiresIn: `${config.authAccessTokenTtlMinutes}m`,
      audience: config.authJwtAudience,
      issuer: config.authJwtIssuer,
      subject: role === "bot" ? "bot" : String(userId),
    },
  );

  return {
    accessToken: token,
    expiresIn: expiresInSeconds,
    sessionId,
  };
}

export function authServiceFactory(config: Config, secrets: Secrets, db: KevbotDb, usersService: UsersService) {
  const exchangeDiscordCode = async (code: string, metadata: SessionMetadata): Promise<SessionGrant> => {
    const accessToken = await exchangeDiscordCodeForToken(
      code,
      secrets.DISCORD_OAUTH2_CLIENT_ID,
      secrets.DISCORD_OAUTH2_CLIENT_SECRET,
      secrets.DISCORD_OAUTH2_REDIRECT_URI,
    );
    return await exchangeDiscord(accessToken, metadata);
  };

  const exchangeDiscord = async (providerAccessToken: string, metadata: SessionMetadata): Promise<SessionGrant> => {
    const profile = await fetchDiscordProfile(providerAccessToken);

    const user = await (async () => {
      const userByDiscordId = await usersService.getUserByDiscordId(profile.id).catch(() => undefined);
      if (userByDiscordId) {
        await usersService.patchUser(userByDiscordId.id, userByDiscordId.id, {
          discord_username: profile.username,
          discord_avatar_hash: profile.avatar,
        });
        return userByDiscordId;
      }

      return await usersService.postUser({
        discord_id: profile.id,
        discord_username: profile.username,
        discord_avatar_hash: profile.avatar,
      });
    })();

    const session = await createSession(db, config, user.id, metadata);
    const tokenBundle = computeAccessToken(config, secrets, "user", user.id, session.id);

    return {
      userId: user.id,
      session,
      ...tokenBundle,
    };
  };

  const refreshAccessToken = async (sessionId: string, metadata: SessionMetadata): Promise<SessionGrant> => {
    const session = await db
      .selectFrom("sessions")
      .select(["user_id", "expires_at", "is_revoked"])
      .where("id", "=", sessionId)
      .executeTakeFirst();

    if (!session || session.is_revoked === 1) {
      throw Boom.unauthorized("Session is invalid or revoked");
    }

    const now = new Date();
    if (session.expires_at <= now) {
      throw Boom.unauthorized("Session has expired");
    }

    const updatedSession = await slideSession(db, config, sessionId, metadata);
    const tokenBundle = computeAccessToken(config, secrets, "user", session.user_id, sessionId);

    return {
      userId: session.user_id,
      session: updatedSession,
      ...tokenBundle,
    };
  };

  const revokeSession = async (sessionId: string) => {
    const result = await db
      .updateTable("sessions")
      .set({ is_revoked: 1 })
      .where("id", "=", sessionId)
      .executeTakeFirst();
    if (Number(result.numUpdatedRows) === 0) {
      throw Boom.notFound("Session not found");
    }
  };

  const issueBotToken = async (apiKey: string | undefined): Promise<AccessTokenBundle> => {
    if (!apiKey || apiKey !== secrets.BOT_AUTH_API_KEY) {
      throw Boom.unauthorized("Invalid bot API key");
    }
    return computeAccessToken(config, secrets, "bot");
  };

  const resolveBotActor = async (discordId: string) => {
    // The UNIQUE discord_id constraint makes concurrent first commands idempotent.
    // Do not overwrite profile metadata supplied by the OAuth flow.
    await db
      .insertInto("users")
      .values({ discord_id: discordId })
      .onDuplicateKeyUpdate({ discord_id: discordId })
      .execute();
    const user = await usersService.getUserByDiscordId(discordId);
    return { user, ...computeAccessToken(config, secrets, "bot", user.id, undefined, user.discord_id) };
  };

  const verifyToken = async (token: string): Promise<AuthContext> => {
    try {
      const decoded = jwt.verify(token, secrets.KEVBOT_API_JWT_SECRET, {
        audience: config.authJwtAudience,
        issuer: config.authJwtIssuer,
        algorithms: ["HS256"],
      });

      if (typeof decoded === "string") {
        throw Boom.unauthorized();
      }

      const sub = "sub" in decoded ? decoded.sub : undefined;
      const role = (decoded as any).role;
      const sessionId = (decoded as any).sid as string | undefined;

      const userId = role === "user" ? Number(sub) : decoded.actor_id;
      if (role === "user" || userId !== undefined) {
        if (!Number.isSafeInteger(userId) || userId <= 0) {
          throw Boom.unauthorized("Token subject is invalid");
        }
      }

      if (role !== "user" && role !== "bot") {
        throw Boom.unauthorized("Token role is invalid");
      }
      if (role === "bot") {
        if (sub !== "bot" || sessionId !== undefined) throw Boom.unauthorized();
        if (userId !== undefined) {
          const actor = await usersService.getUserById(userId);
          if (actor.discord_id !== decoded.actor_discord_id) throw Boom.unauthorized();
        } else if (decoded.actor_discord_id !== undefined) throw Boom.unauthorized();
      } else if (decoded.actor_id !== undefined || decoded.actor_discord_id !== undefined) {
        throw Boom.unauthorized();
      }
      return { userId, role, sessionId, actorDiscordId: role === "bot" ? decoded.actor_discord_id : undefined };
    } catch (err) {
      if (isJwtError(err)) {
        throw Boom.unauthorized(err.message);
      }
      throw Boom.unauthorized();
    }
  };

  return {
    exchangeDiscordCode,
    exchangeDiscord,
    refreshAccessToken,
    revokeSession,
    issueBotToken,
    resolveBotActor,
    verifyToken,
  };
}

export type AuthService = ReturnType<typeof authServiceFactory>;

import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { AuthService } from "../services/authService";
import { authSchemaFactory } from "../schemas/authSchemas";
import { Config } from "../config/config";
import { UsersService } from "../services/usersService";
import Boom from "@hapi/boom";
import { getAuthenticatedUser } from "../utils/getAuthenticatedUser";

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers["cookie"];
  if (!header) {
    return undefined;
  }
  const parts = header.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name}=`)) {
      return decodeURIComponent(trimmed.substring(name.length + 1));
    }
  }
  return undefined;
}

export function authControllerFactory(config: Config, authService: AuthService, usersService: UsersService) {
  const authSchemas = authSchemaFactory();
  const cookieName = config.authRefreshCookieName;
  const refreshCookieMaxAgeMs = config.authRefreshTokenTtlDays * 24 * 60 * 60 * 1000;
  const secureCookies = process.env.NODE_ENV === "production";

  const postDiscordExchange = async (req: Request, res: Response) => {
    const { code } = authSchemas.postExchangeBodySchema.parse(req.body);
    const metadata = { userAgent: req.headers["user-agent"], ip: req.ip };
    const grant = await authService.exchangeDiscordCode(code, metadata);

    // TODO(discord-auth): Either use sameSite=none or
    // put api on subdomain=api.kevbot.com and set domain=kevbot.com, so that frontend at kevbot.com will send cookies to api.kevbot.com
    // TODO(discord-auth): I think only maxAge is needed here.
    res
      .cookie(cookieName, grant.session.id, {
        httpOnly: true,
        secure: secureCookies,
        sameSite: "lax",
        path: config.authRefreshCookiePath,
        maxAge: refreshCookieMaxAgeMs,
        expires: grant.session.expiresAt,
      })
      .status(StatusCodes.OK)
      .json({
        access_token: grant.accessToken,
        token_type: "Bearer",
        expires_in: grant.expiresIn,
        user: { id: grant.userId },
      });
  };

  const postRefresh = async (req: Request, res: Response) => {
    const sessionId = readCookie(req, cookieName);
    if (!sessionId) {
      throw Boom.unauthorized("Refresh session missing");
    }
    const metadata = { userAgent: req.headers["user-agent"], ip: req.ip };
    const grant = await authService.refreshAccessToken(sessionId, metadata);

    // TODO(discord-auth): verify origin/referer

    res.cookie(cookieName, grant.session.id, {
      httpOnly: true,
      secure: secureCookies,
      sameSite: "lax",
      path: config.authRefreshCookiePath,
      maxAge: refreshCookieMaxAgeMs,
      expires: grant.session.expiresAt,
    });

    res.status(StatusCodes.OK).json({
      access_token: grant.accessToken,
      token_type: "Bearer",
      expires_in: grant.expiresIn,
      user: { id: grant.userId },
    });
  };

  const postLogout = async (req: Request, res: Response) => {
    // TODO(discord-auth): verify origin/referer

    const sessionId = readCookie(req, cookieName);
    if (sessionId) {
      try {
        await authService.revokeSession(sessionId);
      } catch (error) {
        // Swallow 404 to keep logout idempotent
        if (!Boom.isBoom(error) || error.output.statusCode !== StatusCodes.NOT_FOUND) {
          throw error;
        }
      }
    }
    res.clearCookie(cookieName, {
      httpOnly: true,
      secure: secureCookies,
      sameSite: "lax",
      path: config.authRefreshCookiePath,
    });
    res.status(StatusCodes.NO_CONTENT).send();
  };

  const getMe = async (req: Request, res: Response) => {
    if (!req.auth) {
      throw Boom.unauthorized("Not authenticated");
    }
    const user = await usersService.getUserById(getAuthenticatedUser(req).id);
    res.status(StatusCodes.OK).json({
      user,
      role: req.auth.role,
      session_id: req.auth.sessionId ?? null,
    });
  };

  const postBotAuth = async (req: Request, res: Response) => {
    const apiKey = req.header(config.botAuthHeader) as string | undefined;
    const tokenBundle = await authService.issueBotToken(apiKey);
    res.status(StatusCodes.OK).json({
      access_token: tokenBundle.accessToken,
      token_type: "Bearer",
      expires_in: tokenBundle.expiresIn,
      role: "bot",
    });
  };

  return {
    postDiscordExchange,
    postRefresh,
    postLogout,
    getMe,
    postBotAuth,
  };
}

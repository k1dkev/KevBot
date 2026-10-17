import { Request, Response, NextFunction } from "express";
import Boom from "@hapi/boom";
import { AuthService } from "../services/authService";

export function authMiddlewareFactory(authService: AuthService) {
  const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1];
    if (!token) {
      throw Boom.unauthorized("Access token is missing");
    }
    const context = await authService.verifyToken(token);
    if (!context.userId) throw Boom.forbidden("Resolve a Discord actor before acting on library resources");
    req.auth = context;
    next();
  };

  const optionalAuth = async (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1];
    if (token) {
      try {
        const context = await authService.verifyToken(token);
        if (context.userId) req.auth = context;
      } catch {
        // No error handling needed; requests can proceed as anonymous user.
      }
    }
    next();
  };

  // Unlike optionalAuth, this rejects a supplied invalid token instead of
  // silently treating the request as anonymous. Use for writes where an
  // invalid browser/bot credential must not downgrade to an anonymous action.
  const optionalAuthStrict = async (req: Request, res: Response, next: NextFunction) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
      next();
      return;
    }
    const token = authorization.match(/^Bearer (\S+)$/i)?.[1];
    if (!token) throw Boom.unauthorized("Authorization must use a Bearer token");
    req.auth = await authService.verifyToken(token);
    next();
  };

  const requireBotService = async (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1];
    if (!token) throw Boom.unauthorized("Bot service token is missing");
    const context = await authService.verifyToken(token);
    if (context.role !== "bot" || context.userId !== undefined) {
      throw Boom.forbidden("Only the bot service can resolve actors");
    }
    req.auth = context;
    next();
  };

  return {
    requireAuth,
    optionalAuth,
    optionalAuthStrict,
    requireBotService,
  };
}

export type AuthMiddleware = ReturnType<typeof authMiddlewareFactory>;

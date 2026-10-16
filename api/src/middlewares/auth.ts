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
    requireBotService,
  };
}

export type AuthMiddleware = ReturnType<typeof authMiddlewareFactory>;

import { Request } from "express";
import Boom from "@hapi/boom";
import { AuthRole } from "../services/authService";

interface AuthenticatedUserContext {
  id: number;
  role: AuthRole;
  sessionId?: string;
}

export const getAuthenticatedUser = (req: Request): AuthenticatedUserContext => {
  if (!req.auth?.userId) {
    throw Boom.unauthorized("User not authenticated");
  }
  return { id: req.auth.userId, role: req.auth.role, sessionId: req.auth.sessionId };
};

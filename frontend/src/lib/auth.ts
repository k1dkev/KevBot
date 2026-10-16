import { logger } from "./logging/browser";

interface JwtPayload {
  role?: string;
  sid?: string;
  exp?: number;
  iat?: number;
  sub?: string;
}

// TODO(discord-auth): is there a library that can do this?
// TODO(discord-auth): why is this even needed? I assume we should actually just get the info about ourselves from the backend api vs /user/@me, instead of decoding the jwt?
// TODO(discord-auth): I do not like the cast to JwtPayload, it seems like a code smell
export function decodeJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }
    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decoded) as JwtPayload;
  } catch (error) {
    logger.debug({ component: "auth", err: error }, "auth.jwt.decode.failed");
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  const payload = decodeJwt(token);
  if (!payload || !payload.exp) {
    return true;
  }
  const expInSeconds = payload.exp;
  const nowInSeconds = Math.floor(Date.now() / 1000);
  return expInSeconds <= nowInSeconds;
}

export function getTokenExpiry(token: string): Date | null {
  const payload = decodeJwt(token);
  if (!payload || !payload.exp) {
    return null;
  }
  return new Date(payload.exp * 1000);
}

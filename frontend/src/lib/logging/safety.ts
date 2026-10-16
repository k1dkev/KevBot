// Portable policy mirrored in frontend/src/lib/logging/safety.ts. A test checks parity.
export const logLevels = ["trace", "debug", "info", "warn", "error", "fatal", "silent"] as const;
export type LogLevel = (typeof logLevels)[number];
export type LogFields = Record<string, unknown>;
type Method = (fields: LogFields, event: string) => void;
export type AppLogger = Record<Exclude<LogLevel, "silent">, Method> & {
  child(fields: LogFields): AppLogger;
};

export function parseLogLevel(value: string | undefined, fallback: LogLevel): LogLevel {
  if (value === undefined) return fallback;
  if (logLevels.includes(value as LogLevel)) return value as LogLevel;
  // Never interpolate an invalid environment value into an exception.
  throw new Error("LOG_LEVEL must be trace, debug, info, warn, error, fatal or silent");
}

const redacted = "[REDACTED]";
export function environmentSecretValues(environment: Record<string, string | undefined>): string[] {
  return Object.entries(environment)
    .filter(([key]) => /secret|password|passwd|token|api_?key|bot.*key|connection.*(?:string|url)/i.test(key))
    .flatMap(([, value]) => {
      if (!value) return [];
      const values = [value];
      try {
        const url = new URL(value);
        if (url.password) values.push(decodeURIComponent(url.password));
        for (const [key, item] of url.searchParams) {
          if (/secret|password|token|key|code|state/i.test(key) && item) values.push(item);
        }
      } catch {
        // Most secrets are opaque strings, not URLs.
      }
      return values;
    });
}
const sensitiveKey =
  /authorization|cookie|password|passwd|secret|token|apikey|botkey|connection|^code$|^state$|^pwd$|^headers$|^query$|^searchparams$|^body$|^data$|^env$|^config$|^secrets$|^req$|^res$|^request$|^response$|^file(s)?$|^audio$|^buffer$|^sql|^parameters$/i;

function safeText(value: string, secrets: readonly string[]): string {
  let text = value;
  // Handle encoded URLs/credentials as well as plain text. Bounds limit hostile inputs.
  for (let i = 0; i < 2; i++) {
    try {
      const decoded = decodeURIComponent(text);
      if (decoded === text) break;
      text = decoded;
    } catch {
      // Decode valid escapes even when unrelated text contains a malformed percent.
      text = text.replace(/(?:%[a-f\d]{2})+/gi, (part) => {
        try {
          return decodeURIComponent(part);
        } catch {
          return part;
        }
      });
    }
  }
  for (const secret of secrets) {
    if (secret) text = text.split(secret).join(redacted);
  }
  return (
    text
      .replace(/\b[a-z][a-z\d+.-]*:\/\/[^\s"'<>]+/gi, (url) => {
        if (!/^https?:\/\//i.test(url) || /:\/\/[^/]*@/.test(url)) return redacted;
        return url.replace(/[?#].*$/, "[REDACTED]");
      })
      .replace(/[?#][^\s"'<>)]*/g, redacted)
      .replace(/\b(?:bearer|basic)\s+[^\s,"'<>]+/gi, redacted)
      .replace(/\beyJ[\w-]*\.[\w-]+\.[\w-]+\b/g, redacted)
      // Drop the rest of a credential-bearing line, including quoted/spaced values.
      .replace(
        /\b[\w-]*(?:authorization|cookie|password|passwd|secret|token|api[_-]?key|bot[_-]?key|connection[_-]?(?:string|url)|oauth[_-]?code|code|state|pwd)[\w-]*["']?\s*[:=][^\r\n]*/gi,
        redacted,
      )
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
      .slice(0, 8000)
  );
}

export function sanitize(
  value: unknown,
  secrets: readonly string[] = [],
  seen = new WeakSet<object>(),
  depth = 0,
): unknown {
  if (depth > 8) return "[TRUNCATED]";
  if (typeof value === "string") return safeText(value, secrets);
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value !== "object") return undefined;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  const descend = (item: unknown) => sanitize(item, secrets, seen, depth + 1);
  if (value instanceof Error) {
    const error = value as Error & { code?: unknown; cause?: unknown; errors?: unknown[]; data?: { cause?: unknown } };
    // Do not copy arbitrary error properties (SQL, request bodies, response headers, etc.).
    return {
      type: descend(error.name),
      message: descend(error.message),
      stack: descend(error.stack),
      errorCode: descend(error.code),
      cause: descend(error.cause ?? error.data?.cause),
      errors: descend(error.errors),
    };
  }
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return redacted;
  if (Array.isArray(value)) return value.slice(0, 100).map(descend);
  // Never traverse browser Events/DOM nodes, Headers, streams, uploads or class instances.
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return redacted;
  const result: LogFields = {};
  for (const key of Object.keys(value).slice(0, 100)) {
    if (["__proto__", "constructor", "prototype", "hasOwnProperty", "toJSON"].includes(key)) continue;
    const safeKey = safeText(key, secrets);
    result[safeKey] = sensitiveKey.test(key.replace(/[^a-z\d]/gi, "")) ? redacted : descend((value as LogFields)[key]);
  }
  return result;
}

// Pino owns filtering, child context and output; this adapter only enforces the safety boundary.
export function adaptLogger(sink: AppLogger, getSecrets: () => readonly string[] = () => []): AppLogger {
  const logger = {} as AppLogger;
  for (const level of logLevels) {
    if (level === "silent") continue;
    logger[level] = (fields, event) => {
      try {
        const secrets = getSecrets();
        sink[level](sanitize(fields, secrets) as LogFields, safeText(event, secrets));
      } catch {
        // A diagnostic failure must not change a request, playback, job or exit outcome.
      }
    };
  }
  logger.child = (fields) => {
    try {
      return adaptLogger(sink.child(sanitize(fields, getSecrets()) as LogFields), getSecrets);
    } catch {
      return logger;
    }
  };
  return logger;
}

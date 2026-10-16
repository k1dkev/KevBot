import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { logContext } from "../logging/context";
import { logger } from "../logging/logger";
import type { AppLogger } from "../logging/safety";

export function requestLoggingFactory(root: AppLogger = logger): RequestHandler {
  return (req, res, next) => {
    // Generate locally; untrusted client IDs can contain credentials or spoof another request.
    const requestId = randomUUID();
    const log = root.child({ component: "http", requestId });
    const prefix =
      req.originalUrl.match(/^\/v1\/(?:auth|bot|dev|users|tracks|playlists|search|plays|docs)(?=\/|[?#]|$)/)?.[0] ?? "";
    const started = performance.now();
    res.setHeader("X-Request-ID", requestId);
    let finished = false;
    const complete = () => {
      if (finished) return;
      finished = true;
      const aborted = !res.writableFinished;
      const status = res.statusCode;
      const fields = {
        // Static API prefix + registered leaf template, never URL/params/query values.
        route: typeof req.route?.path === "string" ? prefix + req.route.path : "unmatched",
        method: req.method,
        status,
        durationMs: Math.round((performance.now() - started) * 100) / 100,
        ...(aborted ? { aborted: true } : {}),
        ...(res.locals.logError ? { err: res.locals.logError } : {}),
      };
      const level = status >= 500 ? "error" : status >= 400 || aborted ? "warn" : "info";
      log[level](fields, "http.request.completed");
    };
    res.once("finish", complete);
    res.once("close", complete);
    logContext.run(log, next);
  };
}

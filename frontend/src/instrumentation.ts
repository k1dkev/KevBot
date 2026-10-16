import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logger } = await import("./lib/logging/server");
    logger.info({}, "server.initialized");
  }
}
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logRequestError } = await import("./lib/logging/server");
    // Use Next's registered route file, never its path/query/headers or RSC body.
    logRequestError(err, request.method, context.routePath);
  }
};

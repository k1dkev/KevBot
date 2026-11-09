const METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]);

export class ApiClientError extends Error {
  constructor(kind, status, outcomeUnknown = false) {
    super(`API request failed: ${kind}`);
    this.name = "ApiClientError";
    this.kind = kind;
    this.status = status;
    this.outcomeUnknown = outcomeUnknown;
  }
}

function failureKind(status) {
  if (status === 401) return "auth";
  if (status === 403) return "denied";
  if (status === 404) return "not_found";
  if (status >= 400 && status < 500 && status !== 429) return "invalid";
  return "unavailable";
}

function validPath(path) {
  if (
    typeof path !== "string" ||
    path.length > 500 ||
    !path.startsWith("/v1/") ||
    path.startsWith("//") ||
    /[?#\\\u0000-\u001f\u007f]/.test(path) ||
    /%(?:2f|5c)/i.test(path) ||
    path.split("/").some((part) => part === "." || part === "..")
  )
    return false;
  try {
    return !path.split("/").some((part) => {
      const decoded = decodeURIComponent(part);
      return decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\");
    });
  } catch {
    return false;
  }
}

function buildUrl(baseUrl, path, query) {
  if (!validPath(path)) throw new ApiClientError("invalid");
  const url = new URL(`${baseUrl}${path}`);
  const entries = Object.entries(query ?? {});
  if (entries.length > 32) throw new ApiClientError("invalid");
  for (const [key, value] of entries) {
    if (!/^[a-z_]{1,40}$/.test(key) || (value !== undefined && String(value).length > 500))
      throw new ApiClientError("invalid");
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function cancelBody(response) {
  try {
    await response.body?.cancel();
  } catch {
    // The body may already be closed by the runtime.
  }
}

async function readBytes(response, maxBytes, status, mutating) {
  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
    await cancelBody(response);
    throw new ApiClientError("protocol", status, mutating);
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new ApiClientError("protocol", status, mutating);
      }
      chunks.push(next.value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // A cancelled stream may still be settling.
    }
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Create a bounded fetch client shared by browser and Node consumers. */
export function createApiClient({
  baseUrl,
  fetch: fetcher = globalThis.fetch,
  timeoutMs = 10000,
  maxResponseBytes = 1048576,
  maxConcurrentRequests = 16,
  requestIdHeader = false,
  onRequest,
} = {}) {
  let normalizedBaseUrl;
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
    if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error();
    normalizedBaseUrl = parsed.toString().replace(/\/$/, "");
  } catch {
    throw new ApiClientError("invalid");
  }
  if (
    typeof fetcher !== "function" ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    !Number.isSafeInteger(maxResponseBytes) ||
    maxResponseBytes < 1 ||
    !Number.isSafeInteger(maxConcurrentRequests) ||
    maxConcurrentRequests < 1
  )
    throw new ApiClientError("invalid");

  const shutdown = new AbortController();
  let active = 0;
  let sequence = 0;

  const report = (event) => {
    try {
      onRequest?.(event);
    } catch {
      // Logging hooks must not change request behavior.
    }
  };

  async function send(path, options = {}, responseType = "json") {
    const method = options.method ?? "GET";
    const mutating = method !== "GET" && method !== "HEAD";
    if (!METHODS.has(method) || shutdown.signal.aborted || options.signal?.aborted)
      throw new ApiClientError(
        shutdown.signal.aborted || options.signal?.aborted ? "closed" : "invalid",
        undefined,
        mutating,
      );
    if (active >= maxConcurrentRequests) throw new ApiClientError("busy", undefined, mutating);

    const url = buildUrl(normalizedBaseUrl, path, options.query);
    const headers = new Headers(options.headers ?? {});
    headers.set("Accept", options.accept ?? (responseType === "bytes" ? "*/*" : "application/json"));
    const requestId = globalThis.crypto?.randomUUID?.() ?? `request-${Date.now()}-${++sequence}`;
    if (requestIdHeader) headers.set("X-Request-ID", requestId);
    let body;
    if (options.json !== undefined) {
      if (method === "GET" || method === "HEAD") throw new ApiClientError("invalid");
      if (options.body !== undefined) throw new ApiClientError("invalid");
      try {
        body = JSON.stringify(options.json);
      } catch {
        throw new ApiClientError("invalid");
      }
      headers.set("Content-Type", "application/json");
    } else if (options.body !== undefined && options.body !== null) {
      if (method === "GET" || method === "HEAD") throw new ApiClientError("invalid");
      body = options.body;
    }

    active++;
    const startedAt = Date.now();
    const controller = new AbortController();
    let timedOut = false;
    let responseStatus;
    let timer;
    let rejectAborted;
    const aborted = new Promise((_, reject) => {
      rejectAborted = reject;
    });
    const abort = (reason) => {
      if (controller.signal.aborted) return;
      timedOut = reason === "timeout";
      controller.abort();
      rejectAborted(new ApiClientError(timedOut ? "timeout" : "closed", responseStatus, mutating));
    };
    const externalAbort = () => abort("external");
    const shutdownAbort = () => abort("shutdown");
    options.signal?.addEventListener("abort", externalAbort, { once: true });
    shutdown.signal.addEventListener("abort", shutdownAbort, { once: true });
    if (options.signal?.aborted || shutdown.signal.aborted) abort("external");
    else timer = setTimeout(() => abort("timeout"), timeoutMs);

    try {
      const operation = (async () => {
        const response = await fetcher(url, {
          method,
          headers,
          ...(body === undefined ? {} : { body }),
          credentials: options.credentials ?? "same-origin",
          ...(options.cache ? { cache: options.cache } : {}),
          redirect: "error",
          signal: controller.signal,
        });
        responseStatus = response.status;
        if (!response.ok) {
          await cancelBody(response);
          throw new ApiClientError(failureKind(response.status), response.status, mutating && response.status >= 500);
        }
        if (response.status === 204 || method === "HEAD") {
          await cancelBody(response);
          return undefined;
        }

        if (responseType === "bytes") {
          const contentType = response.headers.get("content-type") ?? "";
          if (options.expectedContentType && !options.expectedContentType.test(contentType)) {
            await cancelBody(response);
            throw new ApiClientError("protocol", response.status, mutating);
          }
          const bytes = await readBytes(response, maxResponseBytes, response.status, mutating);
          if (!bytes.byteLength) throw new ApiClientError("protocol", response.status, mutating);
          return bytes;
        }

        const bytes = await readBytes(response, maxResponseBytes, response.status, mutating);
        if (!bytes.byteLength) return undefined;
        let value;
        try {
          value = JSON.parse(new TextDecoder().decode(bytes));
        } catch {
          throw new ApiClientError("protocol", response.status, mutating);
        }
        if (options.parse) {
          try {
            value = options.parse(value);
          } catch {
            throw new ApiClientError("protocol", response.status, mutating);
          }
        }
        return value;
      })();
      const value = await Promise.race([operation, aborted]);
      report({ requestId, method, status: responseStatus, durationMs: Date.now() - startedAt });
      return value;
    } catch (error) {
      const failure =
        error instanceof ApiClientError ? error : new ApiClientError("unavailable", responseStatus, mutating);
      report({
        requestId,
        method,
        status: failure.status,
        durationMs: Date.now() - startedAt,
        kind: failure.kind,
      });
      throw failure;
    } finally {
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener("abort", externalAbort);
      shutdown.signal.removeEventListener("abort", shutdownAbort);
      controller.abort();
      active--;
    }
  }

  return {
    baseUrl: normalizedBaseUrl,
    request: (path, options) => send(path, options, "json"),
    requestBytes: (path, options = {}) => send(path, options, "bytes"),
    close() {
      shutdown.abort();
    },
  };
}

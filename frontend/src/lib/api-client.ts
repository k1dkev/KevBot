import { ApiClientError as SharedApiError, createApiClient as createSharedApiClient } from "@kevbot/api-client";
import type {
  ApiPlaylist,
  ApiTrack,
  ApiUser,
  AuthGrantResponse,
  AuthMeResponse,
  FarewellResponse,
  GreetingResponse,
  PaginatedResponse,
  TrackFetchParams,
  UnifiedSearchRequest,
  UnifiedSearchResponse,
} from "@kevbot/api-client";
import type { ApiMethod } from "@kevbot/api-client";

export type {
  AuthGrantResponse,
  AuthMeResponse,
  FarewellResponse,
  GreetingResponse,
  TrackFetchParams,
} from "@kevbot/api-client";

export type FetchLike = typeof fetch;

export interface AuthStore {
  getToken(): string | null;
  setToken(token: string | null): void;
  isTokenExpired(): boolean;
}

export type UnauthenticatedReason = "logout" | "refresh_failed" | "unauthorized";
export type AuthEvent = { type: "authenticated" } | { type: "unauthenticated"; reason?: UnauthenticatedReason };
export interface AuthEvents {
  subscribe(listener: (event: AuthEvent) => void): () => void;
}

function createAuthEventEmitter() {
  const listeners = new Set<(event: AuthEvent) => void>();
  return {
    subscribe(listener: (event: AuthEvent) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(event: AuthEvent) {
      listeners.forEach((listener) => listener(event));
    },
  };
}

export function isTokenExpired(jwt: string): boolean {
  try {
    const [, payload] = jwt.split(".");
    const { exp } = JSON.parse(atob(payload));
    return typeof exp === "number" ? Date.now() / 1000 >= exp - 15 : true;
  } catch {
    return true;
  }
}

export function createMemoryAuthStore(): AuthStore {
  let token: string | null = null;
  return {
    getToken: () => token,
    setToken: (value) => {
      token = value;
    },
    isTokenExpired: () => (token ? isTokenExpired(token) : true),
  };
}

export { SharedApiError as ApiError };

export class UnauthenticatedError extends SharedApiError {
  readonly reason?: UnauthenticatedReason;

  constructor(message = "Unauthenticated", reason?: UnauthenticatedReason) {
    super("auth", 401);
    this.name = "UnauthenticatedError";
    this.message = message;
    this.reason = reason;
  }
}

export type ApiClient = ReturnType<typeof createApiClient>;

function parseGrant(value: unknown): AuthGrantResponse {
  if (
    !value ||
    typeof value !== "object" ||
    !("access_token" in value) ||
    typeof value.access_token !== "string" ||
    value.access_token.length === 0 ||
    !("token_type" in value) ||
    value.token_type !== "Bearer" ||
    !("expires_in" in value) ||
    typeof value.expires_in !== "number"
  )
    throw new Error("Invalid authentication response");
  return value as AuthGrantResponse;
}

export function createApiClient(opts: { baseUrl: string; fetch?: FetchLike; timeoutMs?: number }) {
  const transport = createSharedApiClient({
    baseUrl: opts.baseUrl,
    fetch: opts.fetch,
    timeoutMs: opts.timeoutMs,
    maxResponseBytes: 8 * 1024 * 1024,
    maxConcurrentRequests: 32,
  });
  const baseUrl = transport.baseUrl;
  const auth = createMemoryAuthStore();
  const authEventsEmitter = createAuthEventEmitter();
  const authEvents: AuthEvents = {
    subscribe: (listener) => authEventsEmitter.subscribe(listener),
  };

  async function refreshAccessToken(): Promise<boolean> {
    try {
      const data = await transport.request<AuthGrantResponse>("/v1/auth/refresh", {
        method: "POST",
        credentials: "include",
        parse: parseGrant,
      });
      const hadPreviousToken = auth.getToken() !== null;
      auth.setToken(data.access_token);
      if (hadPreviousToken) authEventsEmitter.emit({ type: "authenticated" });
      return true;
    } catch {
      auth.setToken(null);
      return false;
    }
  }

  async function doFetch<T>(
    path: string,
    init?: RequestInit,
    query?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    const method = (init?.method ?? "GET").toUpperCase() as ApiMethod;
    let unauthReason: UnauthenticatedReason | undefined;

    for (let attempt = 0; attempt < 2; attempt++) {
      if (auth.isTokenExpired()) {
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
          unauthReason = "refresh_failed";
          break;
        }
      }

      const headers = new Headers(init?.headers ?? {});
      headers.set("Authorization", `Bearer ${auth.getToken()}`);
      try {
        return await transport.request<T>(path, {
          method,
          query,
          headers,
          body: init?.body,
          credentials: init?.credentials ?? "same-origin",
          cache: init?.cache,
          signal: init?.signal ?? undefined,
        });
      } catch (error) {
        if (!(error instanceof SharedApiError) || error.status !== 401) throw error;
        auth.setToken(null);
        unauthReason = "unauthorized";
      }
    }

    const reason = unauthReason ?? "unauthorized";
    auth.setToken(null);
    authEventsEmitter.emit({ type: "unauthenticated", reason });
    throw new UnauthenticatedError("Unauthenticated", reason);
  }

  async function exchangeDiscordCode(code: string): Promise<AuthGrantResponse> {
    const data = await transport.request<AuthGrantResponse>("/v1/auth/discord-exchange", {
      method: "POST",
      credentials: "include",
      json: { code },
      parse: parseGrant,
    });
    if (data.access_token) {
      auth.setToken(data.access_token);
      authEventsEmitter.emit({ type: "authenticated" });
    }
    return data;
  }

  async function logout(): Promise<void> {
    await doFetch<void>("/v1/auth/logout", { method: "POST", credentials: "include" });
    auth.setToken(null);
    authEventsEmitter.emit({ type: "unauthenticated", reason: "logout" });
  }

  async function fetchMe(): Promise<AuthMeResponse> {
    return doFetch<AuthMeResponse>("/v1/auth/me");
  }

  const trackQuery = async (params: TrackFetchParams = {}) => {
    const query: Record<string, string | number | boolean | undefined> = {
      offset: params.offset,
      limit: params.limit,
      include_deleted: params.include_deleted,
      user_id: params.user_id,
      playlist_id: params.playlist_id,
    };
    return doFetch<PaginatedResponse<ApiTrack>>("/v1/tracks", undefined, query);
  };

  async function fetchPlaylists(params: { include_deleted?: boolean } = {}): Promise<ApiPlaylist[]> {
    return doFetch<ApiPlaylist[]>("/v1/playlists", undefined, params);
  }

  async function unifiedSearch(params: UnifiedSearchRequest): Promise<UnifiedSearchResponse> {
    const query: Record<string, string | number | boolean | undefined> = {
      q: params.q?.trim() || undefined,
      type: params.type,
      sort: params.sort,
      order: params.order,
      include_deleted: params.include_deleted,
      limit: params.limit,
      offset: params.offset,
      playlist_id: params.playlistId ?? undefined,
      user_id: params.userId ?? undefined,
    };
    return doFetch<UnifiedSearchResponse>("/v1/search", undefined, query);
  }

  return {
    baseUrl,
    authEvents,
    auth: { exchangeDiscordCode, logout, fetchMe },
    tracks: {
      fetch: trackQuery,
      get: (id: number | string) => doFetch<ApiTrack>(`/v1/tracks/${encodeURIComponent(String(id))}`),
      streamUrl: (id: number | string) => `${baseUrl}/v1/tracks/${encodeURIComponent(String(id))}/stream`,
    },
    playlists: {
      fetch: fetchPlaylists,
      get: (id: number | string) => doFetch<ApiPlaylist>(`/v1/playlists/${encodeURIComponent(String(id))}`),
    },
    users: {
      fetch: (id: number | string) => doFetch<ApiUser>(`/v1/users/${encodeURIComponent(String(id))}`),
      greeting: (id: number | string) =>
        doFetch<GreetingResponse>(`/v1/users/${encodeURIComponent(String(id))}/greeting`),
      farewell: (id: number | string) =>
        doFetch<FarewellResponse>(`/v1/users/${encodeURIComponent(String(id))}/farewell`),
    },
    search: { unified: unifiedSearch },
    fetch: doFetch,
    close: () => transport.close(),
  };
}

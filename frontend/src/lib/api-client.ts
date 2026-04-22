import { ApiPlaylist, ApiTrack, PaginatedResponse, UnifiedSearchRequest, UnifiedSearchResponse } from "./types";

export type FetchLike = (input: RequestInfo, init?: RequestInit) => Promise<Response>;

// ---------- Auth Types ----------
export interface AuthGrantResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  user?: { id: number };
}

export interface AuthMeResponse {
  user: {
    id: number;
    discord_id: string;
    discord_username: string;
    discord_avatar_hash: string;
  };
  role: string;
  session_id: string | null;
}

export type TrackFetchParams = {
  offset?: number;
  limit?: number;
  include_deleted?: boolean;
  user_id?: number;
  playlist_id?: number;
};

// ---------- Auth Store ----------
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
    setToken: (t) => {
      token = t;
    },
    isTokenExpired: () => {
      if (!token) return true;
      return isTokenExpired(token);
    },
  };
}

// ---------- Client Options ----------

export class ApiError extends Error {
  status?: number;

  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export type ApiClient = ReturnType<typeof createApiClient>;

export class UnauthenticatedError extends ApiError {
  readonly reason?: UnauthenticatedReason;

  constructor(message = "Unauthenticated", reason?: UnauthenticatedReason) {
    super(message);
    this.name = "UnauthenticatedError";
    this.status = 401;
    this.reason = reason;
  }
}

// ---------- Core Client ----------
// TODO: Improve error handling. Utilize error codes from the api.
export function createApiClient(opts: { baseUrl: string }) {
  const baseUrl = opts.baseUrl;
  const auth = createMemoryAuthStore();
  const authEventsEmitter = createAuthEventEmitter();
  const authEvents: AuthEvents = {
    subscribe: (listener) => authEventsEmitter.subscribe(listener),
  };

  const url = (path: string) => {
    if (!path.startsWith("/")) throw new Error("API path must start with '/'");
    return `${baseUrl}${path}`;
  };

  async function refreshAccessToken(): Promise<boolean> {
    try {
      const res = await fetch(url("/v1/auth/refresh"), {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        auth.setToken(null);
        return false;
      }
      const data = (await res.json()) as AuthGrantResponse;
      const token = data.access_token ?? null;
      const hadPreviousToken = auth.getToken() !== null;
      auth.setToken(token);
      if (!token) {
        return false;
      }
      if (hadPreviousToken) {
        authEventsEmitter.emit({ type: "authenticated" });
      }
      return true;
    } catch {
      auth.setToken(null);
      return false;
    }
  }

  // this function might attempt the fetch multiple times, if token is not expired, but a 401 is received.
  async function doFetch(path: string, init?: RequestInit): Promise<Response> {
    const NUMBER_OF_ATTEMPTS = 2;
    let unauthReason: UnauthenticatedReason | undefined;

    for (let i = 0; i < NUMBER_OF_ATTEMPTS; i++) {
      if (auth.isTokenExpired()) {
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
          unauthReason = "refresh_failed";
          break;
        }
      }

      const headers = new Headers(init?.headers ?? {});
      headers.set("Authorization", `Bearer ${auth.getToken()}`);
      const res = await fetch(url(path), {
        ...init,
        headers,
      });

      if (res.status === 401) {
        auth.setToken(null);
        unauthReason = "unauthorized";
        continue;
      }

      return res;
    }

    const reason = unauthReason ?? "unauthorized";
    auth.setToken(null);
    authEventsEmitter.emit({ type: "unauthenticated", reason });
    throw new UnauthenticatedError("Unauthenticated", reason);
  }

  // ---------- Auth API ----------
  async function exchangeDiscordCode(code: string): Promise<AuthGrantResponse> {
    const res = await fetch(url("/v1/auth/discord-exchange"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ code }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err = new Error(body.error ?? "Failed to exchange Discord code") as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    const data = (await res.json()) as AuthGrantResponse;
    if (data.access_token) {
      auth.setToken(data.access_token);
      authEventsEmitter.emit({ type: "authenticated" });
    }
    return data;
  }

  async function logout(): Promise<void> {
    const res = await doFetch("/v1/auth/logout", { method: "POST", credentials: "include" });
    if (!res.ok && res.status !== 401) throw new Error("Failed to logout");
    auth.setToken(null);
    authEventsEmitter.emit({ type: "unauthenticated", reason: "logout" });
  }

  async function fetchMe(): Promise<AuthMeResponse> {
    const res = await doFetch("/v1/auth/me");
    if (!res.ok) throw new Error("Not authenticated");
    return res.json();
  }

  // ---------- Tracks API ----------
  async function fetchTracks(params: TrackFetchParams = {}): Promise<PaginatedResponse<ApiTrack>> {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) sp.set(k, String(v));
    });
    const res = await doFetch(`/v1/tracks${sp.toString() ? `?${sp}` : ""}`);
    if (!res.ok) throw new Error("Failed to fetch tracks");
    return res.json();
  }

  const getStreamUrl = (trackId: number | string) => `${baseUrl}/v1/tracks/${encodeURIComponent(trackId)}/stream`;

  async function fetchPlaylists(params: { include_deleted?: boolean } = {}): Promise<ApiPlaylist[]> {
    const sp = new URLSearchParams();
    if (params.include_deleted !== undefined) {
      sp.set("include_deleted", String(params.include_deleted));
    }
    const res = await doFetch(`/v1/playlists${sp.toString() ? `?${sp}` : ""}`);
    if (!res.ok) throw new Error("Failed to fetch playlists");
    return res.json();
  }

  async function unifiedSearch(params: UnifiedSearchRequest): Promise<UnifiedSearchResponse> {
    const sp = new URLSearchParams();
    if (params.q) {
      const trimmed = params.q.trim();
      if (trimmed) {
        sp.set("q", trimmed);
      }
    }
    if (params.type) sp.set("type", params.type);
    if (params.sort) sp.set("sort", params.sort);
    if (params.order) sp.set("order", params.order);
    if (params.include_deleted !== undefined) sp.set("include_deleted", String(params.include_deleted));
    if (params.limit !== undefined) sp.set("limit", String(params.limit));
    if (params.offset !== undefined) sp.set("offset", String(params.offset));
    if (params.playlistId) sp.set("playlist_id", String(params.playlistId));
    if (params.userId) sp.set("user_id", String(params.userId));

    const res = await doFetch(`/v1/search${sp.toString() ? `?${sp}` : ""}`);
    if (!res.ok) throw new Error("Failed to perform search");
    return res.json();
  }

  return {
    baseUrl,
    authEvents,
    auth: { exchangeDiscordCode, logout, fetchMe },
    tracks: { fetch: fetchTracks, streamUrl: getStreamUrl },
    playlists: { fetch: fetchPlaylists },
    search: { unified: unifiedSearch },
    fetch: doFetch,
  };
}

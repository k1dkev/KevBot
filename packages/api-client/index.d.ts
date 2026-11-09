export type ApiFailure =
  "auth" | "denied" | "not_found" | "invalid" | "unavailable" | "timeout" | "protocol" | "busy" | "closed";

export class ApiClientError extends Error {
  readonly kind: ApiFailure;
  readonly status?: number;
  readonly outcomeUnknown: boolean;
  constructor(kind: ApiFailure, status?: number, outcomeUnknown?: boolean);
}

export type ApiMethod = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE";
export type ApiQuery = Record<string, string | number | boolean | undefined>;
export interface ApiRequestOptions<T = unknown> {
  method?: ApiMethod;
  query?: ApiQuery;
  json?: unknown;
  body?: BodyInit | null;
  headers?: HeadersInit;
  credentials?: RequestCredentials;
  cache?: RequestCache;
  signal?: AbortSignal;
  parse?: (value: unknown) => T;
}
export interface ApiBytesOptions extends Omit<ApiRequestOptions<never>, "parse"> {
  accept?: string;
  expectedContentType?: RegExp;
}
export interface ApiClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxConcurrentRequests?: number;
  requestIdHeader?: boolean;
  onRequest?: (event: {
    requestId: string;
    method: ApiMethod;
    status?: number;
    durationMs: number;
    kind?: ApiFailure;
  }) => void;
}
export interface ApiClient {
  readonly baseUrl: string;
  request<T = unknown>(path: string, options?: ApiRequestOptions<T>): Promise<T>;
  requestBytes(path: string, options?: ApiBytesOptions): Promise<Uint8Array>;
  close(): void;
}
export function createApiClient(options: ApiClientOptions): ApiClient;

export interface ApiTrack {
  id: number;
  name: string;
  duration: number;
  user_id: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  total_play_count: number;
  raw_total_play_count: number;
  relevance?: number | null;
  user_display_name?: string | null;
  user_discord_id?: string | null;
}
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}
export interface ApiPlaylist {
  id: number;
  name: string;
  user_id: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
export interface ApiUser {
  id: number;
  discord_id: string;
  discord_username: string | null;
  discord_avatar_hash: string | null;
  created_at: string;
  updated_at: string;
}
export type SearchEntity = "tracks" | "playlists" | "users";
export type SearchFilter = "all" | SearchEntity;
export type SearchSort = "relevance" | "name" | "created_at" | "play_count";
export type SearchOrder = "asc" | "desc";
export interface UnifiedSearchUser {
  id: number;
  display_name: string | null;
}
export interface UnifiedSearchResultTrack {
  type: "track";
  id: number;
  name: string;
  created_at: string;
  deleted_at: string | null;
  relevance: number | null;
  duration: number;
  total_play_count: number;
  raw_total_play_count: number;
  user: UnifiedSearchUser;
}
export interface UnifiedSearchResultPlaylist {
  type: "playlist";
  id: number;
  name: string;
  created_at: string;
  deleted_at: string | null;
  relevance: number | null;
  track_count: number;
  user: UnifiedSearchUser;
}
export interface UnifiedSearchResultUser {
  type: "user";
  id: number;
  name: string | null;
  created_at: string;
  deleted_at: null;
  relevance: number | null;
}
export type UnifiedSearchResult = UnifiedSearchResultTrack | UnifiedSearchResultPlaylist | UnifiedSearchResultUser;
export interface UnifiedSearchResponse {
  data: UnifiedSearchResult[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    has_next: boolean;
    has_prev: boolean;
  };
}
export interface UnifiedSearchRequest {
  q?: string;
  type?: SearchFilter;
  sort?: SearchSort;
  order?: SearchOrder;
  include_deleted?: boolean;
  playlistId?: number | null;
  userId?: number | null;
  limit?: number;
  offset?: number;
}
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
export interface TrackFetchParams {
  offset?: number;
  limit?: number;
  include_deleted?: boolean;
  user_id?: number;
  playlist_id?: number;
}
export interface GreetingResponse {
  greeting_track_id: number | null;
  greeting_playlist_id: number | null;
}
export interface FarewellResponse {
  farewell_track_id: number | null;
  farewell_playlist_id: number | null;
}

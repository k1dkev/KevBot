// TODO: Move this to a shared library?

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
  relevance?: number;
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

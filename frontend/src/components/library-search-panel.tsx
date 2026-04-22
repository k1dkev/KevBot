"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Disc3, ListMusic, Loader2, Pause, Play, User as UserIcon } from "lucide-react";
import { api } from "@/lib/api-browser-client";
import { LibrarySearchBar } from "@/components/track-search-bar";
import {
  ApiTrack,
  SearchFilter,
  UnifiedSearchResult,
  UnifiedSearchResultPlaylist,
  UnifiedSearchResultTrack,
  UnifiedSearchResultUser,
} from "@/lib/types";
import { useLibraryFilters } from "@/lib/contexts/library-filters-context";
import { useAuth } from "@/lib/contexts/auth-context";
import { useMusicPlayer } from "@/lib/contexts/music-player-context";
import { useInfiniteScroll } from "@/lib/hooks/useInfiniteScroll";

const PAGE_SIZE = 25;

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

interface PaginationState {
  total: number;
  limit: number;
  offset: number;
  has_next: boolean;
  has_prev: boolean;
}

interface LibrarySearchPanelProps {
  initialQuery?: string;
  initialFilter?: SearchFilter;
  lockedFilter?: SearchFilter | null;
  playlistContext?: { id: number; name: string } | null;
  userContext?: { id: number; displayName?: string | null; discordId: string } | null;
  onSearchStateChange?: (state: { query: string; filter: SearchFilter }) => void;
  onNavigateToPlaylist?: (playlist: { id: number; name: string }) => void;
  onNavigateToUser?: (user: { id: number; displayName?: string | null; discordId: string }) => void;
}

export function LibrarySearchPanel({
  initialQuery = "",
  initialFilter = "all",
  lockedFilter = null,
  playlistContext = null,
  userContext = null,
  onSearchStateChange,
  onNavigateToPlaylist,
  onNavigateToUser,
}: LibrarySearchPanelProps) {
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState<SearchFilter>(lockedFilter ?? initialFilter);
  const [results, setResults] = useState<UnifiedSearchResult[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    total: 0,
    limit: PAGE_SIZE,
    offset: 0,
    has_next: false,
    has_prev: false,
  });
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredTrackId, setHoveredTrackId] = useState<number | null>(null);

  const { currentTrack, isPlaying, isLoading, playTrack, togglePlayPause } = useMusicPlayer();
  const {
    selectedPlaylist,
    setSelectedPlaylist,
    clearSelectedPlaylist,
    selectedUser,
    setSelectedUser,
    clearSelectedUser,
  } = useLibraryFilters();
  const { user } = useAuth();

  const hasMore = results.length < pagination.total;
  const playlistLabel = selectedPlaylist?.name ?? null;
  const userLabel = selectedUser
    ? selectedUser.id === user?.id
      ? "My uploads"
      : selectedUser.displayName ?? selectedUser.discordId
    : null;
  const canClearPlaylistSelection = !!playlistLabel && !playlistContext;
  const canClearUserSelection = !!userLabel && !userContext;

  useEffect(() => setQuery(initialQuery), [initialQuery]);
  useEffect(() => setFilter(lockedFilter ?? initialFilter), [initialFilter, lockedFilter]);

  useEffect(() => {
    if (playlistContext) {
      setSelectedPlaylist(playlistContext);
      return () => clearSelectedPlaylist();
    }
    clearSelectedPlaylist();
    return undefined;
  }, [clearSelectedPlaylist, playlistContext, setSelectedPlaylist]);

  useEffect(() => {
    if (userContext) {
      setSelectedUser({
        id: userContext.id,
        discordId: userContext.discordId,
        displayName: userContext.displayName ?? null,
      });
      return () => clearSelectedUser();
    }
    clearSelectedUser();
    return undefined;
  }, [clearSelectedUser, setSelectedUser, userContext]);

  useEffect(() => {
    if (selectedPlaylist && filter !== "tracks") setFilter("tracks");
  }, [filter, selectedPlaylist]);
  useEffect(() => {
    if (selectedUser && filter !== "tracks") setFilter("tracks");
  }, [filter, selectedUser]);

  const fetchPage = useCallback(
    async (offset: number) =>
      api.search.unified({
        q: query.trim() || undefined,
        type: filter,
        playlistId: selectedPlaylist?.id ?? undefined,
        userId: selectedUser?.id ?? undefined,
        limit: PAGE_SIZE,
        offset,
      }),
    [filter, query, selectedPlaylist?.id, selectedUser?.id]
  );

  useEffect(() => {
    let cancelled = false;
    setIsInitialLoading(true);
    setError(null);
    (async () => {
      try {
        const response = await fetchPage(0);
        if (cancelled) return;
        setResults(response.data);
        setPagination(response.pagination);
      } catch (err) {
        console.error("Search failed", err);
        if (!cancelled) {
          setError("Unable to perform search. Please try again.");
          setResults([]);
          setPagination({ total: 0, limit: PAGE_SIZE, offset: 0, has_next: false, has_prev: false });
        }
      } finally {
        if (!cancelled) setIsInitialLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  const handleSearch = useCallback(async () => {
    setIsInitialLoading(true);
    setError(null);
    try {
      const response = await fetchPage(0);
      setResults(response.data);
      setPagination(response.pagination);
      onSearchStateChange?.({ query: query.trim(), filter });
    } catch (err) {
      console.error("Search failed", err);
      setError("Unable to perform search. Please try again.");
      setResults([]);
      setPagination({ total: 0, limit: PAGE_SIZE, offset: 0, has_next: false, has_prev: false });
    } finally {
      setIsInitialLoading(false);
    }
  }, [fetchPage, filter, onSearchStateChange, query]);

  const loadMore = useCallback(async () => {
    if (!hasMore || isInitialLoading || isFetchingMore) return;
    setIsFetchingMore(true);
    try {
      const response = await fetchPage(results.length);
      setResults((prev) => [...prev, ...response.data]);
      setPagination(response.pagination);
    } catch (err) {
      console.error("Failed to load additional results", err);
      setError("Unable to load more results. Try again.");
    } finally {
      setIsFetchingMore(false);
    }
  }, [fetchPage, hasMore, isFetchingMore, isInitialLoading, results.length]);

  const { targetRef } = useInfiniteScroll(loadMore, {
    disabled: isInitialLoading || isFetchingMore || !hasMore,
  });

  const handleFilterChange = useCallback(
    (next: SearchFilter) => {
      if (lockedFilter && next !== lockedFilter) return;
      if (filter === next) return;
      setFilter(next);
      onSearchStateChange?.({ query: query.trim(), filter: next });
    },
    [filter, lockedFilter, onSearchStateChange, query]
  );

  const handlePlaylistRowClick = useCallback(
    (result: UnifiedSearchResultPlaylist) => {
      const payload = { id: result.id, name: result.name };
      if (onNavigateToPlaylist) {
        onNavigateToPlaylist(payload);
        return;
      }
      if (selectedPlaylist?.id === result.id) {
        clearSelectedPlaylist();
        return;
      }
      setSelectedPlaylist(payload);
      handleFilterChange("tracks");
    },
    [clearSelectedPlaylist, handleFilterChange, onNavigateToPlaylist, selectedPlaylist?.id, setSelectedPlaylist]
  );

  const handleUserRowClick = useCallback(
    (result: UnifiedSearchResultUser) => {
      const payload = { id: result.id, displayName: result.name ?? null, discordId: "" };
      if (onNavigateToUser) {
        onNavigateToUser(payload);
        return;
      }
      if (selectedUser?.id === result.id) {
        clearSelectedUser();
        return;
      }
      setSelectedUser(payload);
      handleFilterChange("tracks");
    },
    [clearSelectedUser, handleFilterChange, onNavigateToUser, selectedUser?.id, setSelectedUser]
  );

  const handleTrackPlay = useCallback(
    (result: UnifiedSearchResultTrack) => {
      if (currentTrack?.id === result.id) {
        togglePlayPause();
        return;
      }
      const track: ApiTrack = {
        id: result.id,
        name: result.name,
        duration: result.duration,
        user_id: result.user.id,
        deleted_at: result.deleted_at,
        created_at: result.created_at,
        updated_at: result.created_at,
        total_play_count: result.total_play_count,
        raw_total_play_count: result.raw_total_play_count,
        user_display_name: result.user.display_name,
      };
      playTrack(track);
    },
    [currentTrack?.id, playTrack, togglePlayPause]
  );

  const trackResults = useMemo(
    () => results.filter((r): r is UnifiedSearchResultTrack => r.type === "track"),
    [results]
  );
  const playlistResults = useMemo(
    () => results.filter((r): r is UnifiedSearchResultPlaylist => r.type === "playlist"),
    [results]
  );
  const userResults = useMemo(
    () => results.filter((r): r is UnifiedSearchResultUser => r.type === "user"),
    [results]
  );

  const showTracks = filter === "all" || filter === "tracks";
  const showPlaylists = filter === "all" || filter === "playlists";
  const showUsers = filter === "all" || filter === "users";

  return (
    <div className="kb-view">
      <LibrarySearchBar
        query={query}
        onQueryChange={setQuery}
        onSubmit={handleSearch}
        selectedFilter={filter}
        onFilterChange={handleFilterChange}
        lockedFilter={lockedFilter}
        isSearching={isInitialLoading}
        activePlaylistLabel={playlistLabel}
        onClearPlaylist={canClearPlaylistSelection ? clearSelectedPlaylist : undefined}
        activeUserLabel={userLabel}
        onClearUser={canClearUserSelection ? clearSelectedUser : undefined}
      />

      {error && (
        <div
          style={{
            color: "hsl(var(--destructive))",
            fontSize: 12,
            padding: "8px 10px",
            border: "1px solid hsl(var(--destructive) / 0.3)",
            borderRadius: "var(--kb-radius)",
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      )}

      <div className="kb-results-info">
        <span>
          Showing {results.length} of {pagination.total} result{pagination.total === 1 ? "" : "s"}
          {query ? (
            <>
              {" for "}
              <em>&ldquo;{query}&rdquo;</em>
            </>
          ) : null}
        </span>
      </div>

      {isInitialLoading && results.length === 0 ? (
        <div className="kb-empty-state">
          <Loader2 className="inline h-4 w-4 animate-spin" /> Loading results…
        </div>
      ) : results.length === 0 ? (
        <div className="kb-empty-state">
          {query ? `No results match "${query}".` : "No results yet."}
        </div>
      ) : (
        <>
          {showTracks && trackResults.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              {filter === "all" && (
                <div className="kb-sb-section-label" style={{ paddingLeft: 0 }}>
                  Tracks
                </div>
              )}
              <div className="kb-track-header">
                <div className="kb-th-num">#</div>
                <div />
                <div className="kb-th-col">Name</div>
                <div className="kb-th-col">Duration (ms)</div>
                <div className="kb-th-col">Relevance</div>
                <div />
              </div>
              {trackResults.map((track, index) => {
                const isCurrent = currentTrack?.id === track.id;
                const isHovered = hoveredTrackId === track.id;
                const showCtrl = isCurrent || isHovered;
                const ownerName =
                  selectedUser &&
                  selectedUser.id === track.user.id &&
                  (selectedUser.displayName || selectedUser.discordId)
                    ? selectedUser.displayName ?? selectedUser.discordId ?? `User #${selectedUser.id}`
                    : track.user.display_name ?? `User #${track.user.id}`;

                return (
                  <div
                    key={`track-${track.id}`}
                    className={`kb-track-row${isCurrent ? " kb-track-current" : ""}`}
                    onMouseEnter={() => setHoveredTrackId(track.id)}
                    onMouseLeave={() =>
                      setHoveredTrackId((prev) => (prev === track.id ? null : prev))
                    }
                    onDoubleClick={() => handleTrackPlay(track)}
                  >
                    <div className="kb-tr-num">{pagination.offset + index + 1}</div>
                    <div className="kb-tr-art">
                      <Disc3 className="h-3 w-3" />
                    </div>
                    <div className="kb-tr-info">
                      <div className={`kb-tr-name${isCurrent ? " kb-tr-current-name" : ""}`}>
                        {track.name}
                      </div>
                      <div className="kb-tr-sub">
                        Track ·{" "}
                        <Link
                          href={`/user/${track.user.id}`}
                          className="kb-tr-uploader"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {ownerName}
                        </Link>
                      </div>
                    </div>
                    <div className="kb-tr-dur">
                      {Math.round(track.duration * 1000).toLocaleString()} ms
                    </div>
                    <div className="kb-tr-rel">
                      {track.relevance !== null ? track.relevance.toFixed(2) : "—"}
                    </div>
                    <button
                      type="button"
                      className="kb-tr-play"
                      style={showCtrl ? { opacity: 1 } : undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTrackPlay(track);
                      }}
                      title={isCurrent && isPlaying ? "Pause" : "Play"}
                    >
                      {isCurrent && isLoading ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : isCurrent && isPlaying ? (
                        <Pause className="h-3 w-3" />
                      ) : (
                        <Play className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {showPlaylists && playlistResults.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              {filter === "all" && (
                <div className="kb-sb-section-label" style={{ paddingLeft: 0 }}>
                  Playlists
                </div>
              )}
              <div className="kb-track-header" style={{ gridTemplateColumns: "28px 28px 1fr 120px 70px 28px" }}>
                <div className="kb-th-num">#</div>
                <div />
                <div className="kb-th-col">Name</div>
                <div className="kb-th-col">Updated</div>
                <div className="kb-th-col">Relevance</div>
                <div />
              </div>
              {playlistResults.map((pl, index) => {
                const isSelected = selectedPlaylist?.id === pl.id;
                return (
                  <div
                    key={`playlist-${pl.id}`}
                    className="kb-track-row"
                    onClick={() => handlePlaylistRowClick(pl)}
                    style={isSelected ? { background: "var(--kb-accent-dim)" } : undefined}
                  >
                    <div className="kb-tr-num">{index + 1}</div>
                    <div className="kb-tr-art">
                      <ListMusic className="h-3 w-3" />
                    </div>
                    <div className="kb-tr-info">
                      <div className={`kb-tr-name${isSelected ? " kb-tr-current-name" : ""}`}>
                        {pl.name}
                      </div>
                      <div className="kb-tr-sub">
                        Playlist · {pl.track_count} track{pl.track_count === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div className="kb-tr-dur">{formatDate(pl.created_at)}</div>
                    <div className="kb-tr-rel">
                      {pl.relevance !== null ? pl.relevance.toFixed(2) : "—"}
                    </div>
                    <div />
                  </div>
                );
              })}
            </div>
          )}

          {showUsers && userResults.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              {filter === "all" && (
                <div className="kb-sb-section-label" style={{ paddingLeft: 0 }}>
                  Users
                </div>
              )}
              <div className="kb-track-header" style={{ gridTemplateColumns: "28px 28px 1fr 120px 70px 28px" }}>
                <div className="kb-th-num">#</div>
                <div />
                <div className="kb-th-col">Name</div>
                <div className="kb-th-col">Joined</div>
                <div className="kb-th-col">Relevance</div>
                <div />
              </div>
              {userResults.map((u, index) => {
                const isSelected = selectedUser?.id === u.id;
                return (
                  <div
                    key={`user-${u.id}`}
                    className="kb-track-row"
                    onClick={() => handleUserRowClick(u)}
                    style={isSelected ? { background: "var(--kb-accent-dim)" } : undefined}
                  >
                    <div className="kb-tr-num">{index + 1}</div>
                    <div className="kb-tr-art">
                      <UserIcon className="h-3 w-3" />
                    </div>
                    <div className="kb-tr-info">
                      <div className={`kb-tr-name${isSelected ? " kb-tr-current-name" : ""}`}>
                        {u.name ?? `User #${u.id}`}
                      </div>
                      <div className="kb-tr-sub">User</div>
                    </div>
                    <div className="kb-tr-dur">{formatDate(u.created_at)}</div>
                    <div className="kb-tr-rel">
                      {u.relevance !== null ? u.relevance.toFixed(2) : "—"}
                    </div>
                    <div />
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {isFetchingMore && (
        <div className="kb-empty-state" style={{ padding: 16 }}>
          <Loader2 className="inline h-3 w-3 animate-spin" /> Loading more results…
        </div>
      )}
      {hasMore && !isFetchingMore && <div ref={targetRef} style={{ height: 32 }} />}
      {!hasMore && results.length > 0 && (
        <div className="kb-empty-state" style={{ padding: 16, fontSize: 11 }}>
          No more results to load
        </div>
      )}
    </div>
  );
}

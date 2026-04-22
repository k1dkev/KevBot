"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Disc3, ListMusic, Loader2, Pause, Play, User as UserIcon } from "lucide-react";
import { api } from "@/lib/api-browser-client";
import { LibrarySearchBar } from "@/components/track-search-bar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ApiTrack,
  SearchFilter,
  SearchOrder,
  SearchSort,
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
const DEBOUNCE_MS = 200;

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

function TypeBadge({ type }: { type: "track" | "playlist" | "user" }) {
  return <span className={`kb-type-badge kb-type-${type}`}>{type}</span>;
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
  initialFilter,
  lockedFilter = null,
  playlistContext = null,
  userContext = null,
  onSearchStateChange,
  onNavigateToPlaylist,
  onNavigateToUser,
}: LibrarySearchPanelProps) {
  const defaultFilter: SearchFilter = lockedFilter ?? initialFilter ?? "tracks";
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState<SearchFilter>(defaultFilter);
  const [sort, setSort] = useState<SearchSort>("relevance");
  const [order, setOrder] = useState<SearchOrder>("desc");
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
  useEffect(() => setFilter(lockedFilter ?? initialFilter ?? "tracks"), [initialFilter, lockedFilter]);

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

  // Debounce the query so each keystroke doesn't fire a request, but the
  // input itself is never disabled — typing stays uninterrupted.
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const fetchPage = useCallback(
    async (offset: number) =>
      api.search.unified({
        q: debouncedQuery.trim() || undefined,
        type: filter,
        sort,
        order,
        playlistId: selectedPlaylist?.id ?? undefined,
        userId: selectedUser?.id ?? undefined,
        limit: PAGE_SIZE,
        offset,
      }),
    [debouncedQuery, filter, order, sort, selectedPlaylist?.id, selectedUser?.id]
  );

  // Notify parent of state changes (debounced) without forcing a manual submit.
  const lastNotifiedRef = useRef<{ query: string; filter: SearchFilter } | null>(null);
  useEffect(() => {
    if (!onSearchStateChange) return;
    const trimmed = debouncedQuery.trim();
    const last = lastNotifiedRef.current;
    if (last && last.query === trimmed && last.filter === filter) return;
    lastNotifiedRef.current = { query: trimmed, filter };
    onSearchStateChange({ query: trimmed, filter });
  }, [debouncedQuery, filter, onSearchStateChange]);

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
    },
    [filter, lockedFilter]
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
        selectedFilter={filter}
        onFilterChange={handleFilterChange}
        sort={sort}
        onSortChange={setSort}
        order={order}
        onOrderChange={setOrder}
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
          {debouncedQuery ? (
            <>
              {" for "}
              <em>&ldquo;{debouncedQuery}&rdquo;</em>
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
          {debouncedQuery ? `No results match "${debouncedQuery}".` : "No results yet."}
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
              <div className="kb-table">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="kb-cell-num">#</TableHead>
                      <TableHead className="kb-cell-art" />
                      <TableHead>Name</TableHead>
                      <TableHead className="kb-cell-meta">Type</TableHead>
                      <TableHead className="kb-cell-meta">Duration (ms)</TableHead>
                      <TableHead className="kb-cell-meta">Plays</TableHead>
                      <TableHead className="kb-cell-meta">Created</TableHead>
                      <TableHead className="kb-cell-rel">Relevance</TableHead>
                      <TableHead className="kb-cell-action" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
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
                        <TableRow
                          key={`track-${track.id}`}
                          className={isCurrent ? "kb-row-current" : undefined}
                          onMouseEnter={() => setHoveredTrackId(track.id)}
                          onMouseLeave={() =>
                            setHoveredTrackId((prev) => (prev === track.id ? null : prev))
                          }
                          onDoubleClick={() => handleTrackPlay(track)}
                        >
                          <TableCell className="kb-cell-num">{pagination.offset + index + 1}</TableCell>
                          <TableCell className="kb-cell-art">
                            <div className="kb-cell-art-inner">
                              <Disc3 className="h-3 w-3" />
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="kb-tr-info">
                              <div className={`kb-tr-name${isCurrent ? " kb-tr-current-name" : ""}`}>
                                {track.name}
                              </div>
                              <div className="kb-tr-sub">
                                <Link
                                  href={`/user/${track.user.id}`}
                                  className="kb-tr-uploader"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {ownerName}
                                </Link>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="kb-cell-meta">
                            <TypeBadge type="track" />
                          </TableCell>
                          <TableCell className="kb-cell-meta">
                            {Math.round(track.duration * 1000).toLocaleString()} ms
                          </TableCell>
                          <TableCell className="kb-cell-meta">
                            {track.total_play_count.toLocaleString()}
                          </TableCell>
                          <TableCell className="kb-cell-meta">{formatDate(track.created_at)}</TableCell>
                          <TableCell className="kb-cell-rel">
                            {track.relevance !== null ? track.relevance.toFixed(2) : "—"}
                          </TableCell>
                          <TableCell className="kb-cell-action">
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
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {showPlaylists && playlistResults.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              {filter === "all" && (
                <div className="kb-sb-section-label" style={{ paddingLeft: 0 }}>
                  Playlists
                </div>
              )}
              <div className="kb-table">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="kb-cell-num">#</TableHead>
                      <TableHead className="kb-cell-art" />
                      <TableHead>Name</TableHead>
                      <TableHead className="kb-cell-meta">Type</TableHead>
                      <TableHead className="kb-cell-meta">Tracks</TableHead>
                      <TableHead className="kb-cell-meta">Created</TableHead>
                      <TableHead className="kb-cell-rel">Relevance</TableHead>
                      <TableHead className="kb-cell-action" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {playlistResults.map((pl, index) => {
                      const isSelected = selectedPlaylist?.id === pl.id;
                      return (
                        <TableRow
                          key={`playlist-${pl.id}`}
                          className={isSelected ? "kb-row-selected" : undefined}
                          onClick={() => handlePlaylistRowClick(pl)}
                        >
                          <TableCell className="kb-cell-num">{index + 1}</TableCell>
                          <TableCell className="kb-cell-art">
                            <div className="kb-cell-art-inner">
                              <ListMusic className="h-3 w-3" />
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="kb-tr-info">
                              <div className={`kb-tr-name${isSelected ? " kb-tr-current-name" : ""}`}>
                                {pl.name}
                              </div>
                              <div className="kb-tr-sub">{pl.user.display_name ?? `User #${pl.user.id}`}</div>
                            </div>
                          </TableCell>
                          <TableCell className="kb-cell-meta">
                            <TypeBadge type="playlist" />
                          </TableCell>
                          <TableCell className="kb-cell-meta">{pl.track_count}</TableCell>
                          <TableCell className="kb-cell-meta">{formatDate(pl.created_at)}</TableCell>
                          <TableCell className="kb-cell-rel">
                            {pl.relevance !== null ? pl.relevance.toFixed(2) : "—"}
                          </TableCell>
                          <TableCell className="kb-cell-action" />
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {showUsers && userResults.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              {filter === "all" && (
                <div className="kb-sb-section-label" style={{ paddingLeft: 0 }}>
                  Users
                </div>
              )}
              <div className="kb-table">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="kb-cell-num">#</TableHead>
                      <TableHead className="kb-cell-art" />
                      <TableHead>Name</TableHead>
                      <TableHead className="kb-cell-meta">Type</TableHead>
                      <TableHead className="kb-cell-meta">Joined</TableHead>
                      <TableHead className="kb-cell-rel">Relevance</TableHead>
                      <TableHead className="kb-cell-action" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {userResults.map((u, index) => {
                      const isSelected = selectedUser?.id === u.id;
                      return (
                        <TableRow
                          key={`user-${u.id}`}
                          className={isSelected ? "kb-row-selected" : undefined}
                          onClick={() => handleUserRowClick(u)}
                        >
                          <TableCell className="kb-cell-num">{index + 1}</TableCell>
                          <TableCell className="kb-cell-art">
                            <div className="kb-cell-art-inner">
                              <UserIcon className="h-3 w-3" />
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="kb-tr-info">
                              <div className={`kb-tr-name${isSelected ? " kb-tr-current-name" : ""}`}>
                                {u.name ?? `User #${u.id}`}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="kb-cell-meta">
                            <TypeBadge type="user" />
                          </TableCell>
                          <TableCell className="kb-cell-meta">{formatDate(u.created_at)}</TableCell>
                          <TableCell className="kb-cell-rel">
                            {u.relevance !== null ? u.relevance.toFixed(2) : "—"}
                          </TableCell>
                          <TableCell className="kb-cell-action" />
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
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

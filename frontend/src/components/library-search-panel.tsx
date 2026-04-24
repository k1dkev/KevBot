"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AudioLines, Disc3, ListMusic, Loader2, Pause, Play, User as UserIcon } from "lucide-react";
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
  // Notifies the caller when the user picks a different filter inside the
  // panel — used to keep an external source of truth (e.g. SearchProvider)
  // in sync with the panel's local filter state.
  onFilterChangeExternal?: (filter: SearchFilter) => void;
  onNavigateToPlaylist?: (playlist: { id: number; name: string }) => void;
  onNavigateToUser?: (user: { id: number; displayName?: string | null; discordId: string }) => void;
  // Optional side-effects (e.g. URL navigation) when the user clears a badge
  // via the X button. The panel always clears its own context first.
  onClearUser?: () => void;
  onClearPlaylist?: () => void;
}

export function LibrarySearchPanel({
  initialQuery = "",
  initialFilter,
  lockedFilter = null,
  playlistContext = null,
  userContext = null,
  onFilterChangeExternal,
  onNavigateToPlaylist,
  onNavigateToUser,
  onClearUser,
  onClearPlaylist,
}: LibrarySearchPanelProps) {
  const defaultFilter: SearchFilter = lockedFilter ?? initialFilter ?? "tracks";
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState<SearchFilter>(defaultFilter);
  const [sort, setSort] = useState<SearchSort>(initialQuery ? "relevance" : "name");
  const [order, setOrder] = useState<SearchOrder>("desc");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [results, setResults] = useState<UnifiedSearchResult[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    total: 0,
    limit: PAGE_SIZE,
    offset: 0,
    has_next: false,
    has_prev: false,
  });
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredTrackId, setHoveredTrackId] = useState<number | null>(null);
  // Track which fetch parameter set last produced the currently-rendered
  // results. Comparing this against the current fetch key during render lets
  // us derive an accurate "is fetching" without waiting for a useEffect to
  // flip a flag — that one-render gap is what was flashing "No results".
  const [lastFetchedKey, setLastFetchedKey] = useState<string | null>(null);

  // Track whether the user has manually picked a sort. If they haven't, we
  // auto-default sort based on whether there's a query (name when empty,
  // relevance when something is typed).
  const userPickedSortRef = useRef(false);

  const { currentTrack, isPlaying, isLoading, playTrack, togglePlayPause } = useMusicPlayer();
  const {
    selectedPlaylist,
    setSelectedPlaylist,
    clearSelectedPlaylist,
    selectedUser,
    setSelectedUser,
    clearSelectedUser,
  } = useLibraryFilters();

  const hasMore = results.length < pagination.total;
  const playlistLabel = selectedPlaylist?.name ?? null;
  const userLabel = selectedUser ? (selectedUser.displayName ?? selectedUser.discordId) : null;
  const canClearPlaylistSelection = !!playlistLabel;
  const canClearUserSelection = !!userLabel;

  const handleClearUserBadge = useCallback(() => {
    clearSelectedUser();
    onClearUser?.();
  }, [clearSelectedUser, onClearUser]);

  const handleClearPlaylistBadge = useCallback(() => {
    clearSelectedPlaylist();
    onClearPlaylist?.();
  }, [clearSelectedPlaylist, onClearPlaylist]);

  useEffect(() => setQuery(initialQuery), [initialQuery]);
  useEffect(() => setFilter(lockedFilter ?? initialFilter ?? "tracks"), [initialFilter, lockedFilter]);

  useEffect(() => {
    // Only manage the playlist selection when a context is explicitly
    // provided. Pages without a playlistContext must not wipe a selection
    // that the user just made (e.g. clicking a playlist row immediately
    // before navigating).
    if (!playlistContext) return;
    setSelectedPlaylist(playlistContext);
    return () => clearSelectedPlaylist();
  }, [clearSelectedPlaylist, playlistContext, setSelectedPlaylist]);

  useEffect(() => {
    if (!userContext) return;
    setSelectedUser({
      id: userContext.id,
      discordId: userContext.discordId,
      displayName: userContext.displayName ?? null,
    });
    return () => clearSelectedUser();
  }, [clearSelectedUser, setSelectedUser, userContext]);

  // Note: filter switching when a user/playlist row is clicked is handled
  // explicitly inside handlePlaylistRowClick / handleUserRowClick. We don't
  // auto-switch here, because setting selectedUser via userContext (e.g. on
  // /user/<id>/playlists) would otherwise force-flip the filter to "tracks".

  // The query arrives already-debounced from the NavBar (it owns the input
  // and debounces URL navigation). A second debounce here just adds latency
  // and keeps stale results onscreen longer than necessary.
  const debouncedQuery = query;

  // Auto-switch sort default based on query presence (only if user hasn't
  // explicitly chosen a sort).
  useEffect(() => {
    if (userPickedSortRef.current) return;
    setSort(debouncedQuery.trim() ? "relevance" : "name");
  }, [debouncedQuery]);

  const handleSortChange = useCallback((next: SearchSort) => {
    userPickedSortRef.current = true;
    setSort(next);
  }, []);

  const hasQuery = debouncedQuery.trim().length > 0;

  // Relevance with no query is meaningless — show a CTA prompt instead of
  // hitting the API and rendering arbitrary results.
  const isRelevanceWithoutQuery = sort === "relevance" && !hasQuery;

  // Sorting users/playlists by play_count isn't supported by the API yet
  // (api/src/schemas/searchSchemas.ts rejects play_count when type != tracks).
  const isUnsupportedSort = sort === "play_count" && (filter === "users" || filter === "playlists");

  const skipFetch = isRelevanceWithoutQuery || isUnsupportedSort;

  // Stable identity for the current set of fetch parameters. We use this both
  // to gate the fetch effect and (critically) to derive `isFetching` during
  // render — comparing it against the last successfully-fetched key tells us
  // whether the on-screen results are stale, with no one-render lag.
  const fetchKey = useMemo(
    () =>
      skipFetch
        ? "__skip__"
        : [
            debouncedQuery.trim(),
            filter,
            sort,
            order,
            includeDeleted ? "1" : "0",
            selectedPlaylist?.id ?? "",
            selectedUser?.id ?? "",
          ].join("|"),
    [debouncedQuery, filter, includeDeleted, order, sort, skipFetch, selectedPlaylist?.id, selectedUser?.id],
  );

  const isFetching = !skipFetch && lastFetchedKey !== fetchKey;
  const hasSettled = lastFetchedKey !== null;

  const fetchPage = useCallback(
    async (offset: number) =>
      api.search.unified({
        q: debouncedQuery.trim() || undefined,
        type: filter,
        sort,
        order,
        include_deleted: includeDeleted || undefined,
        playlistId: selectedPlaylist?.id ?? undefined,
        userId: selectedUser?.id ?? undefined,
        limit: PAGE_SIZE,
        offset,
      }),
    [debouncedQuery, filter, includeDeleted, order, sort, selectedPlaylist?.id, selectedUser?.id],
  );

  useEffect(() => {
    if (skipFetch) {
      setResults([]);
      setPagination({ total: 0, limit: PAGE_SIZE, offset: 0, has_next: false, has_prev: false });
      setError(null);
      setLastFetchedKey(fetchKey);
      return;
    }
    let cancelled = false;
    setError(null);
    (async () => {
      try {
        const response = await fetchPage(0);
        if (cancelled) return;
        setResults(response.data);
        setPagination(response.pagination);
        setLastFetchedKey(fetchKey);
      } catch (err) {
        console.error("Search failed", err);
        if (!cancelled) {
          setError("Unable to perform search. Please try again.");
          setResults([]);
          setPagination({ total: 0, limit: PAGE_SIZE, offset: 0, has_next: false, has_prev: false });
          setLastFetchedKey(fetchKey);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchKey, fetchPage, skipFetch]);

  const loadMore = useCallback(async () => {
    if (!hasMore || isFetching || isFetchingMore) return;
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
  }, [fetchPage, hasMore, isFetchingMore, isFetching, results.length]);

  const { targetRef } = useInfiniteScroll(loadMore, {
    disabled: isFetching || isFetchingMore || !hasMore,
  });

  const handleFilterChange = useCallback(
    (next: SearchFilter) => {
      if (lockedFilter && next !== lockedFilter) return;
      if (filter === next) return;
      // Switching to the playlists filter while a playlist is selected is
      // contradictory ("show me a list of playlists, scoped to one
      // playlist") and the API rejects type=playlists + playlist_id. Clear
      // the playlist selection on the way in.
      if (next === "playlists" && selectedPlaylist) {
        clearSelectedPlaylist();
      }
      setFilter(next);
      onFilterChangeExternal?.(next);
    },
    [clearSelectedPlaylist, filter, lockedFilter, onFilterChangeExternal, selectedPlaylist],
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
      // Switch to tracks so the result is "tracks in this playlist". An
      // active user badge is intentionally preserved — the user can clear it
      // explicitly if they want all tracks in the playlist.
      handleFilterChange("tracks");
    },
    [clearSelectedPlaylist, handleFilterChange, onNavigateToPlaylist, selectedPlaylist?.id, setSelectedPlaylist],
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
    [clearSelectedUser, handleFilterChange, onNavigateToUser, selectedUser?.id, setSelectedUser],
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
    [currentTrack?.id, playTrack, togglePlayPause],
  );

  const trackResults = useMemo(
    () => results.filter((r): r is UnifiedSearchResultTrack => r.type === "track"),
    [results],
  );
  const playlistResults = useMemo(
    () => results.filter((r): r is UnifiedSearchResultPlaylist => r.type === "playlist"),
    [results],
  );
  const userResults = useMemo(() => results.filter((r): r is UnifiedSearchResultUser => r.type === "user"), [results]);

  return (
    <div className="kb-view-fill">
      <div className="kb-view-fill-top">
        <LibrarySearchBar
          selectedFilter={filter}
          onFilterChange={handleFilterChange}
          sort={sort}
          onSortChange={handleSortChange}
          order={order}
          onOrderChange={setOrder}
          includeDeleted={includeDeleted}
          onIncludeDeletedChange={setIncludeDeleted}
          lockedFilter={lockedFilter}
          disableUsersFilter={!!selectedUser}
          activePlaylistLabel={playlistLabel}
          onClearPlaylist={canClearPlaylistSelection ? handleClearPlaylistBadge : undefined}
          activeUserLabel={userLabel}
          onClearUser={canClearUserSelection ? handleClearUserBadge : undefined}
        />

        {!skipFetch && (
          <div className="kb-results-info" style={{ marginTop: 12, marginBottom: 0 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              {hasSettled ? (
                <span>
                  Showing {results.length} of {pagination.total} result
                  {pagination.total === 1 ? "" : "s"}
                  {debouncedQuery ? (
                    <>
                      {" for "}
                      <em>&ldquo;{debouncedQuery}&rdquo;</em>
                    </>
                  ) : null}
                </span>
              ) : (
                <span style={{ opacity: 0.5 }}>Searching…</span>
              )}
              <span
                aria-hidden={!isFetching}
                style={{
                  display: "inline-flex",
                  width: 12,
                  height: 12,
                  visibility: isFetching ? "visible" : "hidden",
                }}
              >
                <Loader2 className="h-3 w-3 animate-spin" style={{ opacity: 0.6 }} />
              </span>
            </span>
          </div>
        )}
      </div>

      <div className="kb-view-fill-scroll">
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

        {isUnsupportedSort ? (
          <div className="kb-cta">
            <div className="kb-cta-title">Sorting {filter} by plays is coming soon. Pick another sort:</div>
            <div className="kb-cta-buttons">
              {debouncedQuery.trim() && (
                <button type="button" className="kb-filter-tab" onClick={() => handleSortChange("relevance")}>
                  Relevance
                </button>
              )}
              <button type="button" className="kb-filter-tab" onClick={() => handleSortChange("name")}>
                Name
              </button>
              <button type="button" className="kb-filter-tab" onClick={() => handleSortChange("created_at")}>
                Created
              </button>
            </div>
          </div>
        ) : isRelevanceWithoutQuery ? (
          <div className="kb-cta">
            <div className="kb-cta-title">Search for something, or pick a different sort to browse:</div>
            <div className="kb-cta-buttons">
              <button type="button" className="kb-filter-tab" onClick={() => handleSortChange("name")}>
                Name
              </button>
              <button type="button" className="kb-filter-tab" onClick={() => handleSortChange("created_at")}>
                Created
              </button>
              <button type="button" className="kb-filter-tab" onClick={() => handleSortChange("play_count")}>
                Plays
              </button>
            </div>
          </div>
        ) : hasSettled && results.length === 0 && !isFetching ? (
          <div className="kb-empty-state">
            {debouncedQuery ? `No results match "${debouncedQuery}".` : "No results yet."}
          </div>
        ) : filter === "tracks" ? (
          <div className="kb-table kb-table-sticky-head">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="kb-cell-num">#</TableHead>
                  <TableHead className="kb-cell-art" />
                  <TableHead className="kb-cell-name">Name</TableHead>
                  <TableHead className="kb-cell-meta">Duration (ms)</TableHead>
                  <TableHead className="kb-cell-meta">Plays</TableHead>
                  <TableHead className="kb-cell-meta">Created</TableHead>
                  {hasQuery && <TableHead className="kb-cell-rel">Relevance</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {trackResults.map((track, index) => {
                  const isCurrent = currentTrack?.id === track.id;
                  const isHovered = hoveredTrackId === track.id;
                  const ownerName =
                    selectedUser &&
                    selectedUser.id === track.user.id &&
                    (selectedUser.displayName || selectedUser.discordId)
                      ? (selectedUser.displayName ?? selectedUser.discordId ?? `User #${selectedUser.id}`)
                      : (track.user.display_name ?? `User #${track.user.id}`);

                  return (
                    <TableRow
                      key={`track-row-${index}`}
                      className={isCurrent ? "kb-row-current" : undefined}
                      onMouseEnter={() => setHoveredTrackId(track.id)}
                      onMouseLeave={() => setHoveredTrackId((prev) => (prev === track.id ? null : prev))}
                      onDoubleClick={() => handleTrackPlay(track)}
                    >
                      <TableCell className="kb-cell-num">
                        {isHovered ? (
                          <button
                            type="button"
                            className="kb-tr-play kb-tr-play-num"
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
                        ) : isCurrent && isPlaying ? (
                          <AudioLines className="kb-tr-playing-icon h-3 w-3" />
                        ) : (
                          index + 1
                        )}
                      </TableCell>
                      <TableCell className="kb-cell-art">
                        <div className="kb-cell-art-inner">
                          <Disc3 className="h-3 w-3" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="kb-tr-info">
                          <div className={`kb-tr-name${isCurrent ? " kb-tr-current-name" : ""}`}>{track.name}</div>
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
                        {Math.round(track.duration * 1000).toLocaleString()} ms
                      </TableCell>
                      <TableCell className="kb-cell-meta">{track.total_play_count.toLocaleString()}</TableCell>
                      <TableCell className="kb-cell-meta">{formatDate(track.created_at)}</TableCell>
                      {hasQuery && (
                        <TableCell className="kb-cell-rel">
                          {track.relevance !== null ? track.relevance.toFixed(2) : "—"}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : filter === "playlists" ? (
          <div className="kb-table kb-table-sticky-head">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="kb-cell-num">#</TableHead>
                  <TableHead className="kb-cell-art" />
                  <TableHead className="kb-cell-name">Name</TableHead>
                  <TableHead className="kb-cell-meta">Tracks</TableHead>
                  <TableHead className="kb-cell-meta">Created</TableHead>
                  {hasQuery && <TableHead className="kb-cell-rel">Relevance</TableHead>}
                  <TableHead className="kb-cell-action" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {playlistResults.map((pl, index) => {
                  const isSelected = selectedPlaylist?.id === pl.id;
                  return (
                    <TableRow
                      key={`playlist-row-${index}`}
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
                          <div className={`kb-tr-name${isSelected ? " kb-tr-current-name" : ""}`}>{pl.name}</div>
                          <div className="kb-tr-sub">{pl.user.display_name ?? `User #${pl.user.id}`}</div>
                        </div>
                      </TableCell>
                      <TableCell className="kb-cell-meta">{pl.track_count}</TableCell>
                      <TableCell className="kb-cell-meta">{formatDate(pl.created_at)}</TableCell>
                      {hasQuery && (
                        <TableCell className="kb-cell-rel">
                          {pl.relevance !== null ? pl.relevance.toFixed(2) : "—"}
                        </TableCell>
                      )}
                      <TableCell className="kb-cell-action" />
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : filter === "users" ? (
          <div className="kb-table kb-table-sticky-head">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="kb-cell-num">#</TableHead>
                  <TableHead className="kb-cell-art" />
                  <TableHead className="kb-cell-name">Name</TableHead>
                  <TableHead className="kb-cell-meta">Joined</TableHead>
                  {hasQuery && <TableHead className="kb-cell-rel">Relevance</TableHead>}
                  <TableHead className="kb-cell-action" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {userResults.map((u, index) => {
                  const isSelected = selectedUser?.id === u.id;
                  return (
                    <TableRow
                      key={`user-row-${index}`}
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
                      <TableCell className="kb-cell-meta">{formatDate(u.created_at)}</TableCell>
                      {hasQuery && (
                        <TableCell className="kb-cell-rel">
                          {u.relevance !== null ? u.relevance.toFixed(2) : "—"}
                        </TableCell>
                      )}
                      <TableCell className="kb-cell-action" />
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : null}

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
    </div>
  );
}

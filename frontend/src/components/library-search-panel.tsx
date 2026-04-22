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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useInfiniteScroll } from "@/lib/hooks/useInfiniteScroll";
import { cn } from "@/lib/utils";

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

  const { currentTrack, isPlaying, isLoading, playTrack, togglePlayPause } = useMusicPlayer();
  const [hoveredTrackId, setHoveredTrackId] = useState<number | null>(null);

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

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    setFilter(lockedFilter ?? initialFilter);
  }, [initialFilter, lockedFilter]);

  useEffect(() => {
    if (playlistContext) {
      setSelectedPlaylist(playlistContext);
      return () => {
        clearSelectedPlaylist();
      };
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
      return () => {
        clearSelectedUser();
      };
    }
    clearSelectedUser();
    return undefined;
  }, [clearSelectedUser, setSelectedUser, userContext]);

  const isTrackFilter = filter === "tracks";
  const isPlaylistFilter = filter === "playlists";
  const isUserFilter = filter === "users";
  const columnCount = isTrackFilter || isPlaylistFilter || isUserFilter ? 5 : 4;

  useEffect(() => {
    if (selectedPlaylist && filter !== "tracks") {
      setFilter("tracks");
    }
  }, [filter, selectedPlaylist]);

  useEffect(() => {
    if (selectedUser && filter !== "tracks") {
      setFilter("tracks");
    }
  }, [filter, selectedUser]);

  const fetchPage = useCallback(
    async (offset: number) => {
      const response = await api.search.unified({
        q: query.trim() || undefined,
        type: filter,
        playlistId: selectedPlaylist?.id ?? undefined,
        userId: selectedUser?.id ?? undefined,
        limit: PAGE_SIZE,
        offset,
      });
      return response;
    },
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
          setPagination({
            total: 0,
            limit: PAGE_SIZE,
            offset: 0,
            has_next: false,
            has_prev: false,
          });
        }
      } finally {
        if (!cancelled) {
          setIsInitialLoading(false);
        }
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
      const trimmed = query.trim();
      onSearchStateChange?.({ query: trimmed, filter });
    } catch (err) {
      console.error("Search failed", err);
      setError("Unable to perform search. Please try again.");
      setResults([]);
      setPagination({
        total: 0,
        limit: PAGE_SIZE,
        offset: 0,
        has_next: false,
        has_prev: false,
      });
    } finally {
      setIsInitialLoading(false);
    }
  }, [fetchPage, filter, onSearchStateChange, query]);

  const loadMore = useCallback(async () => {
    if (!hasMore || isInitialLoading || isFetchingMore) return;
    setIsFetchingMore(true);
    try {
      const nextOffset = results.length;
      const response = await fetchPage(nextOffset);
      setResults((prev) => [...prev, ...response.data]);
      setPagination(response.pagination);
    } catch (err) {
      console.error("Failed to load additional results", err);
      setError("Unable to load more results. Try again.");
    } finally {
      setIsFetchingMore(false);
    }
  }, [fetchPage, hasMore, isFetchingMore, isInitialLoading, results.length]);

  const { targetRef, isLoadingRef } = useInfiniteScroll(loadMore, {
    disabled: isInitialLoading || isFetchingMore || !hasMore,
  });

  const handleFilterChange = useCallback(
    (nextFilter: SearchFilter) => {
      if (lockedFilter && nextFilter !== lockedFilter) {
        return;
      }
      if (filter === nextFilter) {
        return;
      }
      setFilter(nextFilter);
      onSearchStateChange?.({ query: query.trim(), filter: nextFilter });
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
      const payload = {
        id: result.id,
        displayName: result.name ?? null,
        discordId: "",
      };

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

  const tableContent = useMemo(() => {
    if (isInitialLoading && results.length === 0) {
      return (
        <TableRow>
          <TableCell colSpan={columnCount} className="py-10 text-center text-muted-foreground">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
            Loading results...
          </TableCell>
        </TableRow>
      );
    }

    if (results.length === 0) {
      return (
        <TableRow>
          <TableCell colSpan={columnCount} className="py-10 text-center text-muted-foreground">
            {query ? "No results match your search." : "No results yet."}
          </TableCell>
        </TableRow>
      );
    }

    return results.map((result, index) => {
      const displayIndex = pagination.offset + index + 1;

      if (result.type === "track") {
        const trackResult: UnifiedSearchResultTrack = result;
        const isCurrent = currentTrack?.id === trackResult.id;
        const isHovered = hoveredTrackId === trackResult.id;
        const showControl = isCurrent || isHovered;
        const playIcon = isCurrent ? (
          isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )
        ) : (
          <Play className="h-4 w-4" />
        );

        const resolvedOwnerName =
          selectedUser &&
          selectedUser.id === trackResult.user.id &&
          (selectedUser.displayName || selectedUser.discordId)
            ? selectedUser.displayName ?? selectedUser.discordId ?? `User #${selectedUser.id}`
            : trackResult.user.display_name ?? `User #${trackResult.user.id}`;

        return (
          <TableRow
            key={`track-${trackResult.id}`}
            className="group cursor-pointer transition-colors hover:bg-muted/60"
            onMouseEnter={() => setHoveredTrackId(trackResult.id)}
            onMouseLeave={() => setHoveredTrackId((prev) => (prev === trackResult.id ? null : prev))}
            onClick={() => handleTrackPlay(trackResult)}
          >
            <TableCell className="w-14">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handleTrackPlay(trackResult);
                }}
                className="relative flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium text-muted-foreground transition-colors hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className={cn("transition-opacity", showControl ? "opacity-0" : "opacity-100")}>
                  {displayIndex}
                </span>
                <span
                  className={cn(
                    "absolute inset-0 flex items-center justify-center transition-opacity",
                    showControl ? "opacity-100" : "opacity-0"
                  )}
                >
                  {playIcon}
                </span>
              </button>
            </TableCell>
            <TableCell className="w-14">
              <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-white text-muted-foreground dark:bg-zinc-900">
                <Disc3 className="h-4 w-4" />
              </div>
            </TableCell>
            <TableCell>
              <div className="flex flex-col">
                <span className={cn("font-medium", { "text-primary": isCurrent })}>{trackResult.name}</span>
                <span className="text-xs text-muted-foreground">
                  Track •{" "}
                  <Link
                    href={`/user/${trackResult.user.id}`}
                    className="hover:text-primary hover:underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {resolvedOwnerName}
                  </Link>
                </span>
              </div>
            </TableCell>
            {isTrackFilter && (
              <TableCell className="text-sm text-muted-foreground">
                {Math.round(trackResult.duration * 1000).toLocaleString()} ms
              </TableCell>
            )}
            {isPlaylistFilter && <TableCell />}
            {isUserFilter && <TableCell />}
            <TableCell className="text-right text-sm text-muted-foreground">
              {trackResult.relevance !== null ? trackResult.relevance.toFixed(2) : "—"}
            </TableCell>
          </TableRow>
        );
      }

      if (result.type === "playlist") {
        const playlistResult: UnifiedSearchResultPlaylist = result;
        const isSelected = selectedPlaylist?.id === playlistResult.id;
        return (
          <TableRow
            key={`playlist-${playlistResult.id}`}
            className="cursor-pointer transition-colors hover:bg-muted/60"
            onClick={() => handlePlaylistRowClick(playlistResult)}
            data-state={isSelected ? "selected" : undefined}
          >
            <TableCell className="w-14 text-sm text-muted-foreground">{displayIndex}</TableCell>
            <TableCell className="w-14">
              <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-white text-muted-foreground dark:bg-zinc-900">
                <ListMusic className="h-4 w-4" />
              </div>
            </TableCell>
            <TableCell>
              <div className="flex flex-col">
                <span className={cn("font-medium", { "text-primary": isSelected })}>{playlistResult.name}</span>
                <span className="text-xs text-muted-foreground">
                  Playlist • {playlistResult.track_count} track{playlistResult.track_count === 1 ? "" : "s"}
                </span>
              </div>
            </TableCell>
            {isPlaylistFilter && (
              <TableCell className="text-sm text-muted-foreground">
                Created {formatDate(playlistResult.created_at)}
              </TableCell>
            )}
            {isUserFilter && <TableCell />}
            <TableCell className="text-right text-sm text-muted-foreground">
              {playlistResult.relevance !== null ? playlistResult.relevance.toFixed(2) : "—"}
            </TableCell>
          </TableRow>
        );
      }

      if (result.type === "user") {
        const userResult: UnifiedSearchResultUser = result;
        const isSelected = selectedUser?.id === userResult.id;
        return (
          <TableRow
            key={`user-${userResult.id}`}
            className="cursor-pointer transition-colors hover:bg-muted/60"
            onClick={() => handleUserRowClick(userResult)}
            data-state={isSelected ? "selected" : undefined}
          >
            <TableCell className="w-14 text-sm text-muted-foreground">{displayIndex}</TableCell>
            <TableCell className="w-14">
              <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-white text-muted-foreground dark:bg-zinc-900">
                <UserIcon className="h-4 w-4" />
              </div>
            </TableCell>
            <TableCell>
              <div className="flex flex-col">
                <span className={cn("font-medium", { "text-primary": isSelected })}>
                  {userResult.name ?? `User #${userResult.id}`}
                </span>
                <span className="text-xs text-muted-foreground">User</span>
              </div>
            </TableCell>
            {isTrackFilter && <TableCell />}
            {isPlaylistFilter && <TableCell />}
            {isUserFilter && (
              <TableCell className="text-sm text-muted-foreground">
                Joined {formatDate(userResult.created_at)}
              </TableCell>
            )}
            <TableCell className="text-right text-sm text-muted-foreground">
              {userResult.relevance !== null ? userResult.relevance.toFixed(2) : "—"}
            </TableCell>
          </TableRow>
        );
      }

      return null;
    });
  }, [
    currentTrack?.id,
    handlePlaylistRowClick,
    handleTrackPlay,
    handleUserRowClick,
    hoveredTrackId,
    isInitialLoading,
    isLoading,
    isPlaylistFilter,
    isTrackFilter,
    isUserFilter,
    isPlaying,
    pagination.offset,
    query,
    results,
    columnCount,
    selectedPlaylist?.id,
    selectedUser,
  ]);

  return (
    <div className="space-y-6">
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
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-md border dark:border-zinc-800 bg-card dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b px-4 py-3 text-sm text-muted-foreground">
          <span>
            Showing {results.length} of {pagination.total} result{pagination.total === 1 ? "" : "s"}
          </span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14 text-center">#</TableHead>
              <TableHead className="w-14">Art</TableHead>
              <TableHead>Name</TableHead>
              {isTrackFilter && <TableHead className="text-right">Duration (ms)</TableHead>}
              {isPlaylistFilter && <TableHead>Updated</TableHead>}
              {isUserFilter && <TableHead>Joined</TableHead>}
              <TableHead className="text-right">Relevance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tableContent}
            {isFetchingMore && (
              <TableRow>
                <TableCell colSpan={columnCount} className="py-4 text-center text-muted-foreground">
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                  Loading more results...
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {hasMore && !isFetchingMore && <div ref={targetRef} className="h-8" />}
        {!hasMore && results.length > 0 && (
          <div className="px-4 py-3 text-center text-sm text-muted-foreground">No more results to load</div>
        )}
        {isLoadingRef.current && !isFetchingMore && (
          <div className="px-4 py-3 text-center text-sm text-muted-foreground">Loading more results...</div>
        )}
      </div>
    </div>
  );
}

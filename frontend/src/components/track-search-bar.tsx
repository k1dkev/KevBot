"use client";

import { ChangeEvent, KeyboardEvent } from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchFilter } from "@/lib/types";

interface LibrarySearchBarProps {
  query: string;
  onQueryChange: (value: string) => void;
  onSubmit: () => void;
  selectedFilter: SearchFilter;
  onFilterChange: (filter: SearchFilter) => void;
  isSearching?: boolean;
  lockedFilter?: SearchFilter | null;
  activePlaylistLabel?: string | null;
  onClearPlaylist?: () => void;
  activeUserLabel?: string | null;
  onClearUser?: () => void;
}

const FILTER_OPTIONS: Array<{ value: SearchFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "tracks", label: "Tracks" },
  { value: "playlists", label: "Playlists" },
  { value: "users", label: "Users" },
];

export function LibrarySearchBar({
  query,
  onQueryChange,
  onSubmit,
  selectedFilter,
  onFilterChange,
  isSearching = false,
  lockedFilter = null,
  activePlaylistLabel,
  onClearPlaylist,
  activeUserLabel,
  onClearUser,
}: LibrarySearchBarProps) {
  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    onQueryChange(event.target.value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onSubmit();
    }
  };

  const isFilterLocked = lockedFilter !== null && lockedFilter !== undefined;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
        <div className="relative flex-1">
          <input
            type="search"
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Search tracks, playlists, or users..."
            disabled={isSearching}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-75"
            aria-label="Search library"
          />
          {isSearching && (
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {FILTER_OPTIONS.map((option) => {
            const isActive = selectedFilter === option.value;
            const disabled = isSearching || (isFilterLocked && lockedFilter !== option.value);
            return (
              <Button
                key={option.value}
                type="button"
                variant={isActive ? "default" : "outline"}
                size="sm"
                onClick={() => !disabled && onFilterChange(option.value)}
                disabled={disabled}
              >
                {option.label}
              </Button>
            );
          })}
          <Button type="button" onClick={onSubmit} disabled={isSearching} className="md:ml-2">
            <Search className="mr-2 h-4 w-4" />
            Search
          </Button>
        </div>
        {(activePlaylistLabel || activeUserLabel) && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {activePlaylistLabel && (
              <Badge variant="secondary" className="flex items-center gap-2">
                Playlist: {activePlaylistLabel}
                {onClearPlaylist && (
                  <button
                    type="button"
                    onClick={onClearPlaylist}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    ×
                  </button>
                )}
              </Badge>
            )}
            {activeUserLabel && (
              <Badge variant="secondary" className="flex items-center gap-2">
                User: {activeUserLabel}
                {onClearUser && (
                  <button type="button" onClick={onClearUser} className="text-muted-foreground hover:text-foreground">
                    ×
                  </button>
                )}
              </Badge>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

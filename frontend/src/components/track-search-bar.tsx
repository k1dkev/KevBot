"use client";

import { ChangeEvent, KeyboardEvent } from "react";
import { Loader2, Search } from "lucide-react";
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
  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => onQueryChange(e.target.value);
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSubmit();
    }
  };

  const isFilterLocked = lockedFilter !== null && lockedFilter !== undefined;

  return (
    <div className="kb-search-form">
      <div style={{ position: "relative", marginBottom: 10 }}>
        <input
          type="search"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Search tracks, playlists, or users…"
          disabled={isSearching}
          className="kb-search-input-lg"
          aria-label="Search library"
          autoFocus
        />
        {isSearching && (
          <span
            style={{
              position: "absolute",
              right: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--kb-text3)",
            }}
          >
            <Loader2 className="h-4 w-4 animate-spin" />
          </span>
        )}
      </div>
      <div className="kb-search-meta">
        <div className="kb-filter-tabs">
          {FILTER_OPTIONS.map((option) => {
            const isActive = selectedFilter === option.value;
            const disabled = isSearching || (isFilterLocked && lockedFilter !== option.value);
            return (
              <button
                key={option.value}
                type="button"
                disabled={disabled}
                className={`kb-filter-tab${isActive ? " kb-filter-active" : ""}`}
                onClick={() => onFilterChange(option.value)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={isSearching}
          className="kb-search-btn"
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <Search className="h-3 w-3" />
          Search
        </button>
      </div>
      {(activePlaylistLabel || activeUserLabel) && (
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {activePlaylistLabel && (
            <span className="kb-tag">
              Playlist: {activePlaylistLabel}
              {onClearPlaylist && (
                <button type="button" onClick={onClearPlaylist} aria-label="Clear playlist filter">
                  ×
                </button>
              )}
            </span>
          )}
          {activeUserLabel && (
            <span className="kb-tag">
              User: {activeUserLabel}
              {onClearUser && (
                <button type="button" onClick={onClearUser} aria-label="Clear user filter">
                  ×
                </button>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

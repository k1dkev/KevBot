"use client";

import { ChangeEvent } from "react";
import { Loader2 } from "lucide-react";
import { SearchFilter, SearchOrder, SearchSort } from "@/lib/types";

interface LibrarySearchBarProps {
  query: string;
  onQueryChange: (value: string) => void;
  selectedFilter: SearchFilter;
  onFilterChange: (filter: SearchFilter) => void;
  sort: SearchSort;
  onSortChange: (sort: SearchSort) => void;
  order: SearchOrder;
  onOrderChange: (order: SearchOrder) => void;
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

const SORT_OPTIONS: Array<{ value: SearchSort; label: string }> = [
  { value: "relevance", label: "Relevance" },
  { value: "name", label: "Name" },
  { value: "created_at", label: "Created" },
  { value: "play_count", label: "Plays" },
];

const ORDER_OPTIONS: Array<{ value: SearchOrder; label: string }> = [
  { value: "desc", label: "Desc" },
  { value: "asc", label: "Asc" },
];

export function LibrarySearchBar({
  query,
  onQueryChange,
  selectedFilter,
  onFilterChange,
  sort,
  onSortChange,
  order,
  onOrderChange,
  isSearching = false,
  lockedFilter = null,
  activePlaylistLabel,
  onClearPlaylist,
  activeUserLabel,
  onClearUser,
}: LibrarySearchBarProps) {
  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => onQueryChange(e.target.value);

  const isFilterLocked = lockedFilter !== null && lockedFilter !== undefined;

  return (
    <div className="kb-search-form">
      <div style={{ position: "relative", marginBottom: 10 }}>
        <input
          type="search"
          value={query}
          onChange={handleInputChange}
          placeholder="Search tracks, playlists, or users…"
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
            const disabled = isFilterLocked && lockedFilter !== option.value;
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
        <div className="kb-search-controls">
          <span className="kb-select-label">Sort by</span>
          <select
            className="kb-select"
            value={sort}
            onChange={(e) => onSortChange(e.target.value as SearchSort)}
            aria-label="Sort by"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            className="kb-select"
            value={order}
            onChange={(e) => onOrderChange(e.target.value as SearchOrder)}
            aria-label="Order"
          >
            {ORDER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
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

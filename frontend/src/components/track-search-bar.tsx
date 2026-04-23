"use client";

import { ChangeEvent } from "react";
import { ArrowDown, ArrowUp, Loader2, Trash2 } from "lucide-react";
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
  includeDeleted: boolean;
  onIncludeDeletedChange: (next: boolean) => void;
  isSearching?: boolean;
  lockedFilter?: SearchFilter | null;
  disableUsersFilter?: boolean;
  activePlaylistLabel?: string | null;
  onClearPlaylist?: () => void;
  activeUserLabel?: string | null;
  onClearUser?: () => void;
}

const FILTER_OPTIONS: Array<{ value: SearchFilter; label: string }> = [
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

export function LibrarySearchBar({
  query,
  onQueryChange,
  selectedFilter,
  onFilterChange,
  sort,
  onSortChange,
  order,
  onOrderChange,
  includeDeleted,
  onIncludeDeletedChange,
  isSearching = false,
  lockedFilter = null,
  disableUsersFilter = false,
  activePlaylistLabel,
  onClearPlaylist,
  activeUserLabel,
  onClearUser,
}: LibrarySearchBarProps) {
  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => onQueryChange(e.target.value);
  const isFilterLocked = lockedFilter !== null && lockedFilter !== undefined;

  const orderLabel = order === "asc" ? "Asc" : "Desc";
  const OrderIcon = order === "asc" ? ArrowUp : ArrowDown;

  return (
    <div className="kb-search-form" style={{ marginBottom: 0 }}>
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
      <div className="kb-search-controls" style={{ justifyContent: "flex-start" }}>
        {FILTER_OPTIONS.map((option) => {
          const isActive = selectedFilter === option.value;
          const lockedOut = isFilterLocked && lockedFilter !== option.value;
          const usersDisabled = option.value === "users" && disableUsersFilter;
          const disabled = lockedOut || usersDisabled;
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              title={usersDisabled ? "Clear the user filter to browse users" : undefined}
              className={`kb-filter-tab${isActive ? " kb-filter-active" : ""}`}
              onClick={() => onFilterChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
        <span className="kb-control-divider" />
        <span className="kb-control-label">Sort by</span>
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`kb-filter-tab${sort === opt.value ? " kb-filter-active" : ""}`}
            onClick={() => onSortChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
        <button
          type="button"
          className="kb-icon-toggle"
          onClick={() => onOrderChange(order === "asc" ? "desc" : "asc")}
          title={`Order: ${orderLabel} (click to toggle)`}
          aria-label={`Toggle order, currently ${orderLabel}`}
        >
          <OrderIcon className="h-3 w-3" />
          {orderLabel}
        </button>
        <button
          type="button"
          className={`kb-icon-toggle${includeDeleted ? " kb-icon-toggle-active" : ""}`}
          onClick={() => onIncludeDeletedChange(!includeDeleted)}
          title={includeDeleted ? "Hide deleted" : "Include deleted"}
          aria-pressed={includeDeleted}
        >
          <Trash2 className="h-3 w-3" />
          Include deleted
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

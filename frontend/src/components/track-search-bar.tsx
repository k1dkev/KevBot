"use client";

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { SearchFilter, SearchOrder, SearchSort } from "@/lib/types";

interface LibrarySearchBarProps {
  selectedFilter: SearchFilter;
  onFilterChange: (filter: SearchFilter) => void;
  sort: SearchSort;
  onSortChange: (sort: SearchSort) => void;
  order: SearchOrder;
  onOrderChange: (order: SearchOrder) => void;
  includeDeleted: boolean;
  onIncludeDeletedChange: (next: boolean) => void;
  lockedFilter?: SearchFilter | null;
  disableUsersFilter?: boolean;
  activePlaylistLabel?: string | null;
  onClearPlaylist?: () => void;
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
  selectedFilter,
  onFilterChange,
  sort,
  onSortChange,
  order,
  onOrderChange,
  includeDeleted,
  onIncludeDeletedChange,
  lockedFilter = null,
  disableUsersFilter = false,
  activePlaylistLabel,
  onClearPlaylist,
}: LibrarySearchBarProps) {
  const isFilterLocked = lockedFilter !== null && lockedFilter !== undefined;
  const orderLabel = order === "asc" ? "Asc" : "Desc";
  const OrderIcon = order === "asc" ? ArrowUp : ArrowDown;

  return (
    <div className="kb-search-form">
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
      {activePlaylistLabel && (
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <span className="kb-tag">
            Playlist: {activePlaylistLabel}
            {onClearPlaylist && (
              <button type="button" onClick={onClearPlaylist} aria-label="Clear playlist filter">
                ×
              </button>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

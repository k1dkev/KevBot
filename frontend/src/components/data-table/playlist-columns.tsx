"use client";

import { ListMusic } from "lucide-react";
import { ColumnDef } from "@/components/ui/data-table";

export interface PlaylistRow {
  id: number;
  name: string;
  created_at: string;
  user: { id: number; display_name: string | null };
  track_count?: number;
  relevance?: number | null;
}

export interface PlaylistColumnsOptions {
  showTrackCount?: boolean;
  showPlays?: boolean;
  showCreated?: boolean;
  showRelevance?: boolean;
  // Override for the "Created by …" subtitle when caller knows a better label
  // (e.g. user-page-client passes the page user's display name).
  creatorLabel?: (row: PlaylistRow) => string;
  // Append a trailing empty kb-cell-action column (kept for parity with the
  // search panel's rendering; harmless when omitted).
  trailingActionCell?: boolean;
}

// TODO(api): no per-playlist play_count yet — placeholder until backend exposes it.
const PLAYS_PLACEHOLDER = 9000;

function formatDateLocale(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

export function playlistColumns(opts: PlaylistColumnsOptions = {}): ColumnDef<PlaylistRow>[] {
  const {
    showTrackCount = false,
    showPlays = false,
    showCreated = true,
    showRelevance = false,
    creatorLabel,
    trailingActionCell = false,
  } = opts;

  const cols: ColumnDef<PlaylistRow>[] = [];

  cols.push({
    id: "num",
    header: "#",
    className: "kb-cell-num",
    render: (_row, ctx) => ctx.index + 1,
  });

  cols.push({
    id: "art",
    header: "",
    className: "kb-cell-art",
    render: () => (
      <div className="kb-cell-art-inner">
        <ListMusic className="h-3 w-3" />
      </div>
    ),
  });

  cols.push({
    id: "name",
    header: "Name",
    className: "kb-cell-name",
    render: (row, ctx) => {
      const sub = creatorLabel
        ? creatorLabel(row)
        : (row.user.display_name ?? `User #${row.user.id}`);
      return (
        <div className="kb-tr-info">
          <div className={`kb-tr-name${ctx.isSelected ? " kb-tr-current-name" : ""}`}>{row.name}</div>
          <div className="kb-tr-sub">{sub}</div>
        </div>
      );
    },
  });

  if (showTrackCount) {
    cols.push({
      id: "tracks",
      header: "Tracks",
      className: "kb-cell-meta",
      render: (row) => (row.track_count ?? 0).toLocaleString(),
    });
  }

  if (showPlays) {
    cols.push({
      id: "plays",
      header: "Plays",
      className: "kb-cell-meta",
      render: () => PLAYS_PLACEHOLDER.toLocaleString(),
    });
  }

  if (showCreated) {
    cols.push({
      id: "created",
      header: "Created",
      className: "kb-cell-meta",
      render: (row) => formatDateLocale(row.created_at),
    });
  }

  if (showRelevance) {
    cols.push({
      id: "relevance",
      header: "Relevance",
      className: "kb-cell-rel",
      render: (row) => (row.relevance != null ? row.relevance.toFixed(2) : "—"),
    });
  }

  if (trailingActionCell) {
    cols.push({
      id: "action",
      header: "",
      className: "kb-cell-action",
      render: () => null,
    });
  }

  return cols;
}

"use client";

import Link from "next/link";
import { AudioLines, Disc3, Loader2, Pause, Play } from "lucide-react";
import { ColumnDef } from "@/components/ui/data-table";

export interface TrackRow {
  id: number;
  name: string;
  duration: number;
  total_play_count: number;
  created_at: string;
  user: { id: number; display_name: string | null };
  relevance?: number | null;
}

export interface TrackColumnsOptions {
  showDuration?: boolean;
  showPlays?: boolean;
  showCreated?: boolean;
  showRelevance?: boolean;
  // "plain": # cell shows the row index; trailing action cell is the play surface (legacy user-tracks-table behaviour).
  // "play-on-hover": # cell shows index by default, hover swaps for play/pause, AudioLines icon when current+playing.
  numCellMode?: "plain" | "play-on-hover";
  trailingActionCell?: boolean;
  // Player state — required when numCellMode === "play-on-hover" or trailingActionCell === true.
  currentTrackId?: number | null;
  isPlaying?: boolean;
  isLoading?: boolean;
  onPlay?: (row: TrackRow) => void;
  // Override for the uploader sub-text (used by library-search when a userContext outranks the track's own user).
  ownerLabel?: (row: TrackRow) => string;
}

function formatDateLocale(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

function PlayButton({
  row,
  variant,
  isCurrent,
  isCurrentPlaying,
  isCurrentLoading,
  onPlay,
}: {
  row: TrackRow;
  variant: "num" | "trailing";
  isCurrent: boolean;
  isCurrentPlaying: boolean;
  isCurrentLoading: boolean;
  onPlay?: (row: TrackRow) => void;
}) {
  const className = variant === "num" ? "kb-tr-play kb-tr-play-num" : "kb-tr-play";
  return (
    <button
      type="button"
      className={className}
      style={variant === "trailing" && isCurrent ? { opacity: 1 } : undefined}
      onClick={(e) => {
        e.stopPropagation();
        onPlay?.(row);
      }}
      title={isCurrentPlaying ? "Pause" : "Play"}
    >
      {isCurrentLoading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : isCurrentPlaying ? (
        <Pause className="h-3 w-3" />
      ) : (
        <Play className="h-3 w-3" />
      )}
    </button>
  );
}

export function trackColumns(opts: TrackColumnsOptions): ColumnDef<TrackRow>[] {
  const {
    showDuration = true,
    showPlays = true,
    showCreated = true,
    showRelevance = false,
    numCellMode = "plain",
    trailingActionCell = false,
    currentTrackId = null,
    isPlaying = false,
    isLoading = false,
    onPlay,
    ownerLabel,
  } = opts;

  const cols: ColumnDef<TrackRow>[] = [];

  // # column
  cols.push({
    id: "num",
    header: "#",
    className: "kb-cell-num",
    render: (row, ctx) => {
      if (numCellMode === "play-on-hover") {
        const isCurrent = currentTrackId === row.id;
        if (ctx.isHovered) {
          return (
            <PlayButton
              row={row}
              variant="num"
              isCurrent={isCurrent}
              isCurrentPlaying={isCurrent && isPlaying}
              isCurrentLoading={isCurrent && isLoading}
              onPlay={onPlay}
            />
          );
        }
        if (isCurrent && isPlaying) {
          return <AudioLines className="kb-tr-playing-icon h-3 w-3" />;
        }
      }
      return ctx.index + 1;
    },
  });

  // Artwork column
  cols.push({
    id: "art",
    header: "",
    className: "kb-cell-art",
    render: () => (
      <div className="kb-cell-art-inner">
        <Disc3 className="h-3 w-3" />
      </div>
    ),
  });

  // Name column
  cols.push({
    id: "name",
    header: "Name",
    className: "kb-cell-name",
    render: (row, ctx) => {
      const isCurrent = currentTrackId === row.id;
      const owner = ownerLabel ? ownerLabel(row) : (row.user.display_name ?? `User #${row.user.id}`);
      return (
        <div className="kb-tr-info">
          <div className={`kb-tr-name${isCurrent ? " kb-tr-current-name" : ""}`}>{row.name}</div>
          <div className="kb-tr-sub">
            <Link href={`/user/${row.user.id}`} className="kb-tr-uploader" onClick={(e) => e.stopPropagation()}>
              {owner}
            </Link>
          </div>
        </div>
      );
      void ctx; // silence unused
    },
  });

  if (showDuration) {
    cols.push({
      id: "duration",
      header: "Duration (ms)",
      className: "kb-cell-meta",
      render: (row) => `${Math.round(row.duration * 1000).toLocaleString()} ms`,
    });
  }

  if (showPlays) {
    cols.push({
      id: "plays",
      header: "Plays",
      className: "kb-cell-meta",
      render: (row) => row.total_play_count.toLocaleString(),
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
      render: (row) => {
        const isCurrent = currentTrackId === row.id;
        return (
          <PlayButton
            row={row}
            variant="trailing"
            isCurrent={isCurrent}
            isCurrentPlaying={isCurrent && isPlaying}
            isCurrentLoading={isCurrent && isLoading}
            onPlay={onPlay}
          />
        );
      },
    });
  }

  return cols;
}

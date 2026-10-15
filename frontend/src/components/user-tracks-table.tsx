"use client";

import { useMemo } from "react";
import { ApiTrack } from "@/lib/types";
import { DataTable } from "@/components/ui/data-table";
import { trackColumns, TrackRow } from "@/components/data-table/track-columns";
import { useMusicPlayer } from "@/lib/contexts/music-player-context";

interface UserTracksTableProps {
  tracks: ApiTrack[];
  stickyHead?: boolean;
  showPlays?: boolean;
  showCreated?: boolean;
  showDuration?: boolean;
}

export function UserTracksTable({
  tracks,
  stickyHead = false,
  showPlays = true,
  showCreated = true,
  showDuration = true,
}: UserTracksTableProps) {
  const { currentTrack, isPlaying, isLoading, playTrack, togglePlayPause } = useMusicPlayer();

  // Adapt ApiTrack → TrackRow shape used by the column factory.
  const rows = useMemo<TrackRow[]>(
    () =>
      tracks.map((t) => ({
        id: t.id,
        name: t.name,
        duration: t.duration,
        total_play_count: t.total_play_count,
        created_at: t.created_at,
        user: { id: t.user_id, display_name: t.user_display_name ?? null },
      })),
    [tracks],
  );

  const handlePlay = (row: TrackRow) => {
    if (currentTrack?.id === row.id) {
      togglePlayPause();
      return;
    }
    const original = tracks.find((t) => t.id === row.id);
    if (original) playTrack(original);
  };

  const columns = trackColumns({
    showDuration,
    showPlays,
    showCreated,
    numCellMode: "play-on-hover",
    currentTrackId: currentTrack?.id ?? null,
    isPlaying,
    isLoading,
    onPlay: handlePlay,
  });

  return (
    <DataTable<TrackRow>
      rows={rows}
      columns={columns}
      getRowKey={(row) => row.id}
      rowState={(row) => ({ current: currentTrack?.id === row.id })}
      onRowDoubleClick={handlePlay}
      variant="condensed"
      stickyHead={stickyHead}
      emptyState={<div className="kb-empty-state" style={{ padding: 24 }}>No tracks yet.</div>}
    />
  );
}

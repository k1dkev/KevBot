"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { ApiPlaylist } from "@/lib/types";
import { DataTable } from "@/components/ui/data-table";
import { playlistColumns, PlaylistRow } from "@/components/data-table/playlist-columns";

interface UserPlaylistsTableProps {
  playlists: ApiPlaylist[];
  creatorName: string | null;
  stickyHead?: boolean;
  showPlays?: boolean;
  showCreated?: boolean;
}

export function UserPlaylistsTable({
  playlists,
  creatorName,
  stickyHead = false,
  showPlays = false,
  showCreated = true,
}: UserPlaylistsTableProps) {
  const router = useRouter();

  const rows = useMemo<PlaylistRow[]>(
    () =>
      playlists.map((p) => ({
        id: p.id,
        name: p.name,
        created_at: p.created_at,
        user: { id: p.user_id, display_name: creatorName ?? null },
      })),
    [creatorName, playlists],
  );

  const columns = playlistColumns({
    showPlays,
    showCreated,
    creatorLabel: creatorName ? () => `Created by ${creatorName}` : undefined,
  });

  return (
    <DataTable<PlaylistRow>
      rows={rows}
      columns={columns}
      getRowKey={(row) => row.id}
      onRowClick={(row) => router.push(`/playlist/${row.id}`)}
      variant="condensed"
      stickyHead={stickyHead}
      emptyState={<div className="kb-empty-state" style={{ padding: 24 }}>No playlists yet.</div>}
    />
  );
}

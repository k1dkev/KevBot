"use client";

import { useRouter } from "next/navigation";
import { ListMusic } from "lucide-react";
import { ApiPlaylist } from "@/lib/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

// TODO(api): no per-playlist play_count yet — placeholder until backend exposes it.
const PLAYS_PLACEHOLDER = 9000;

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

  if (playlists.length === 0) {
    return <div className="kb-empty-state" style={{ padding: 24 }}>No playlists yet.</div>;
  }

  return (
    <div className={`kb-table kb-table-condensed${stickyHead ? " kb-table-sticky-head" : ""}`}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="kb-cell-num">#</TableHead>
            <TableHead className="kb-cell-art" />
            <TableHead className="kb-cell-name">Name</TableHead>
            {showPlays && <TableHead className="kb-cell-meta">Plays</TableHead>}
            {showCreated && <TableHead className="kb-cell-meta">Created</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {playlists.map((pl, index) => (
            <TableRow
              key={pl.id}
              onClick={() => router.push(`/playlist/${pl.id}`)}
              style={{ cursor: "pointer" }}
            >
              <TableCell className="kb-cell-num">{index + 1}</TableCell>
              <TableCell className="kb-cell-art">
                <div className="kb-cell-art-inner">
                  <ListMusic className="h-3 w-3" />
                </div>
              </TableCell>
              <TableCell>
                <div className="kb-tr-info">
                  <div className="kb-tr-name">{pl.name}</div>
                  <div className="kb-tr-sub">
                    {creatorName ? `Created by ${creatorName}` : `User #${pl.user_id}`}
                  </div>
                </div>
              </TableCell>
              {showPlays && (
                <TableCell className="kb-cell-meta">{PLAYS_PLACEHOLDER.toLocaleString()}</TableCell>
              )}
              {showCreated && <TableCell className="kb-cell-meta">{formatDate(pl.created_at)}</TableCell>}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

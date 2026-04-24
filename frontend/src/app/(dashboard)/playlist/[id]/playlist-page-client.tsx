"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-browser-client";
import { LibrarySearchPanel } from "@/components/library-search-panel";
import { useSearchContext } from "@/lib/contexts/search-context";
import { useUserName } from "@/lib/hooks/useUserName";
import { ApiPlaylist, ApiTrack } from "@/lib/types";

// Server caps `limit` at 100 (api/src/config/config.ts: maxResultsPerPage).
const TRACK_FETCH_LIMIT = 100;

interface PlaylistPageClientProps {
  playlist: ApiPlaylist;
}

function formatCreated(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function PlaylistPageClient({ playlist }: PlaylistPageClientProps) {
  const router = useRouter();
  const { query } = useSearchContext();
  const ownerName = useUserName(playlist.user_id);

  const [tracks, setTracks] = useState<ApiTrack[]>([]);
  const [tracksTotal, setTracksTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.tracks.fetch({ playlist_id: playlist.id, limit: TRACK_FETCH_LIMIT });
        if (cancelled) return;
        setTracks(res.data);
        setTracksTotal(res.pagination.total);
      } catch (err) {
        console.error("Failed to load playlist tracks", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [playlist.id]);

  // TODO(api): tracks endpoint caps at 100 per request — for very large playlists
  // this under-counts total plays. Same caveat as the user page.
  const totalPlays = tracks.reduce((sum, t) => sum + t.total_play_count, 0);

  const handleNavigateUser = useCallback(
    (user: { id: number; displayName?: string | null; discordId: string }) => {
      router.push(`/user/${user.id}`);
    },
    [router],
  );

  const initial = playlist.name[0]?.toUpperCase() ?? "?";
  const ownerLabel = ownerName ?? `User #${playlist.user_id}`;

  return (
    <>
      <div className="kb-profile-hero">
        <div className="kb-profile-avatar">{initial}</div>
        <div>
          <div className="kb-profile-name">{playlist.name}</div>
          <div className="kb-profile-sub">
            Created {formatCreated(playlist.created_at)} · by{" "}
            <Link href={`/user/${playlist.user_id}`} className="kb-tr-uploader">
              {ownerLabel}
            </Link>
          </div>
        </div>
      </div>

      <div className="kb-stats-row">
        <div className="kb-stat-card">
          <div className="kb-stat-num">{tracksTotal.toLocaleString()}</div>
          <div className="kb-stat-lbl">Tracks</div>
        </div>
        <div className="kb-stat-card">
          <div className="kb-stat-num">{totalPlays.toLocaleString()}</div>
          <div className="kb-stat-lbl">Total Plays</div>
        </div>
      </div>

      <LibrarySearchPanel
        initialQuery={query}
        initialFilter="tracks"
        lockedFilter="tracks"
        playlistContext={{ id: playlist.id, name: playlist.name }}
        onNavigateToUser={handleNavigateUser}
        onClearPlaylist={() => router.replace("/search?type=tracks")}
      />
    </>
  );
}

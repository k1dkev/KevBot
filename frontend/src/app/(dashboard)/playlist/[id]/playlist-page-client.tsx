"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api-browser-client";
import { logger } from "@/lib/logging/browser";
import { LibrarySearchPanel } from "@/components/library-search-panel";
import { useSearchContext } from "@/lib/contexts/search-context";
import { useUserName } from "@/lib/hooks/useUserName";
import { ApiPlaylist } from "@/lib/types";
import { searchHref } from "@/lib/search/search-navigation";

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
  const searchParams = useSearchParams();
  const { query, sort, order, includeDeleted } = useSearchContext();
  const ownerName = useUserName(playlist.user_id);

  const [tracksTotal, setTracksTotal] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTracksTotal(null);
    (async () => {
      try {
        const res = await api.tracks.fetch({ playlist_id: playlist.id, limit: TRACK_FETCH_LIMIT });
        if (cancelled) return;
        setTracksTotal(res.pagination.total);
      } catch (err) {
        logger.error({ component: "playlist", err }, "playlist.tracks.load.failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [playlist.id]);

  const handleNavigateUser = useCallback(
    (user: { id: number; displayName?: string | null; discordId: string }) => {
      router.push(`/user/${user.id}`);
    },
    [router],
  );

  const initial = playlist.name[0]?.toUpperCase() ?? "?";
  const ownerLabel = ownerName ?? `User #${playlist.user_id}`;

  const handleClearPlaylist = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("playlist_id");
    router.replace(searchHref("/search", params, { query, type: "tracks", sort, order, includeDeleted }));
  };

  return (
    <>
      <div className="kb-profile-hero">
        <div className="kb-profile-avatar">{initial}</div>
        <div>
          <h1 className="kb-profile-name">{playlist.name}</h1>
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
          <div className="kb-stat-num">{tracksTotal?.toLocaleString() ?? "—"}</div>
          <div className="kb-stat-lbl">Tracks</div>
        </div>
      </div>

      <LibrarySearchPanel
        initialQuery={query}
        initialFilter="tracks"
        lockedFilter="tracks"
        playlistContext={{ id: playlist.id, name: playlist.name }}
        onNavigateToUser={handleNavigateUser}
        onClearPlaylist={handleClearPlaylist}
      />
    </>
  );
}

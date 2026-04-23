"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api-browser-client";
import { ApiPlaylist, ApiTrack, ApiUser } from "@/lib/types";
import { UserPlaylistsTable } from "@/components/user-playlists-table";
import { UserTracksTable } from "@/components/user-tracks-table";

const TOP_LIMIT = 5;
const PLAYLIST_PREVIEW = 8;
// Server caps `limit` at 100 (api/src/config/config.ts: maxResultsPerPage).
const TRACK_FETCH_LIMIT = 100;

interface UserPageClientProps {
  user: ApiUser;
}

export default function UserPageClient({ user }: UserPageClientProps) {
  const [tracks, setTracks] = useState<ApiTrack[]>([]);
  const [tracksTotal, setTracksTotal] = useState(0);
  const [playlists, setPlaylists] = useState<ApiPlaylist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const [tracksRes, allPlaylists] = await Promise.all([
          api.tracks.fetch({ user_id: user.id, limit: TRACK_FETCH_LIMIT }),
          api.playlists.fetch(),
        ]);
        if (cancelled) return;
        setTracks(tracksRes.data);
        setTracksTotal(tracksRes.pagination.total);
        setPlaylists(allPlaylists.filter((p) => p.user_id === user.id));
      } catch (err) {
        console.error("Failed to load user profile data", err);
        if (!cancelled) setError("Failed to load profile data.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  // Top Uploads: most-played tracks uploaded by this user.
  const topUploads = useMemo(
    () => [...tracks].sort((a, b) => b.total_play_count - a.total_play_count).slice(0, TOP_LIMIT),
    [tracks]
  );

  // TODO(api): no per-user total-plays endpoint exists. Summing the first
  // page of tracks would under-count any user with > TRACK_FETCH_LIMIT uploads.
  const totalPlays = null as number | null;

  // TODO(api): no per-user listening-history endpoint exists. "Top Listened"
  // should reflect what *this user has played*, not what their uploads accrued.
  const topListened: ApiTrack[] = [];

  const playlistsPreview = playlists.slice(0, PLAYLIST_PREVIEW);

  if (isLoading) {
    return (
      <div className="kb-empty-state">
        <Loader2 className="inline h-4 w-4 animate-spin" /> Loading profile…
      </div>
    );
  }

  if (error) {
    return (
      <div className="kb-empty-state" style={{ color: "hsl(var(--destructive))" }}>
        {error}
      </div>
    );
  }

  return (
    <>
      <div className="kb-stats-row">
        <div className="kb-stat-card">
          <div className="kb-stat-num">{tracksTotal.toLocaleString()}</div>
          <div className="kb-stat-lbl">Uploads</div>
        </div>
        <div className="kb-stat-card">
          <div className="kb-stat-num">{totalPlays !== null ? totalPlays.toLocaleString() : "—"}</div>
          <div className="kb-stat-lbl">Total Plays</div>
        </div>
        <div className="kb-stat-card">
          <div className="kb-stat-num">{playlists.length.toLocaleString()}</div>
          <div className="kb-stat-lbl">Playlists</div>
        </div>
      </div>

      <div className="kb-grid-2col">
        <div>
          <div className="kb-section-header">
            <div className="kb-section-title">Top Uploads</div>
            {tracks.length > TOP_LIMIT && (
              <Link href={`/user/${user.id}/tracks`} className="kb-link-btn">
                See all →
              </Link>
            )}
          </div>
          <UserTracksTable tracks={topUploads} showPlays={false} showCreated={false} />
        </div>
        <div>
          <div className="kb-section-header">
            <div className="kb-section-title">Top Listened</div>
          </div>
          {topListened.length === 0 ? (
            <div className="kb-empty-state" style={{ padding: 24 }}>
              Listening history not yet available.
            </div>
          ) : (
            <UserTracksTable tracks={topListened} showPlays={false} showCreated={false} />
          )}
        </div>
      </div>

      <div className="kb-section-header">
        <div className="kb-section-title">Playlists</div>
        {playlists.length > PLAYLIST_PREVIEW && (
          <Link href={`/user/${user.id}/playlists`} className="kb-link-btn">
            See all →
          </Link>
        )}
      </div>
      <UserPlaylistsTable
        playlists={playlistsPreview}
        creatorName={user.discord_username ?? null}
      />
    </>
  );
}

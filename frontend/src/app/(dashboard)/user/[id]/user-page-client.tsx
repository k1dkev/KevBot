"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pause, Play } from "lucide-react";
import { api } from "@/lib/api-browser-client";
import { ApiPlaylist, ApiTrack, ApiUser } from "@/lib/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMusicPlayer } from "@/lib/contexts/music-player-context";
import { useLibraryFilters } from "@/lib/contexts/library-filters-context";

const TOP_LIMIT = 5;
const PLAYLIST_PREVIEW = 8;
// Server caps `limit` at 100 (api/src/config/config.ts: maxResultsPerPage).
const TRACK_FETCH_LIMIT = 100;

interface UserPageClientProps {
  user: ApiUser;
}

export default function UserPageClient({ user }: UserPageClientProps) {
  const router = useRouter();
  const { setSelectedUser } = useLibraryFilters();
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

  const handleSeeAllTracks = () => {
    setSelectedUser({
      id: user.id,
      discordId: user.discord_id,
      displayName: user.discord_username ?? null,
    });
    router.push("/search/tracks");
  };

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
        <ProfileTrackSection title="Top Uploads" tracks={topUploads} onSeeAll={handleSeeAllTracks} />
        <ProfileTrackSection
          title="Top Listened"
          tracks={topListened}
          emptyMessage="Listening history not yet available."
        />
      </div>

      <div className="kb-section-header">
        <div className="kb-section-title">Playlists</div>
      </div>
      {playlists.length === 0 ? (
        <div className="kb-empty-state" style={{ padding: 24 }}>No playlists yet.</div>
      ) : (
        <div className="kb-pl-grid">
          {playlistsPreview.map((pl) => (
            <PlaylistCard key={pl.id} playlist={pl} creatorName={user.discord_username ?? null} />
          ))}
        </div>
      )}
    </>
  );
}

interface ProfileTrackSectionProps {
  title: string;
  tracks: ApiTrack[];
  onSeeAll?: () => void;
  emptyMessage?: string;
}

function ProfileTrackSection({ title, tracks, onSeeAll, emptyMessage }: ProfileTrackSectionProps) {
  const { currentTrack, isPlaying, isLoading, playTrack, togglePlayPause } = useMusicPlayer();

  const handlePlay = (track: ApiTrack) => {
    if (currentTrack?.id === track.id) {
      togglePlayPause();
    } else {
      playTrack(track);
    }
  };

  return (
    <div>
      <div className="kb-section-header">
        <div className="kb-section-title">{title}</div>
        {onSeeAll && (
          <button type="button" className="kb-link-btn" onClick={onSeeAll}>
            See all →
          </button>
        )}
      </div>
      {tracks.length === 0 ? (
        <div className="kb-empty-state" style={{ padding: 24 }}>
          {emptyMessage ?? "No tracks yet."}
        </div>
      ) : (
        <div className="kb-table">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="kb-cell-num">#</TableHead>
                <TableHead className="kb-cell-art" />
                <TableHead>Name</TableHead>
                <TableHead className="kb-cell-meta">Duration (ms)</TableHead>
                <TableHead className="kb-cell-action" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tracks.map((track, index) => {
                const isCurrent = currentTrack?.id === track.id;
                const isCurrentLoading = isCurrent && isLoading;
                const isCurrentPlaying = isCurrent && isPlaying;
                return (
                  <TableRow
                    key={track.id}
                    className={isCurrent ? "kb-row-current" : undefined}
                    onDoubleClick={() => handlePlay(track)}
                  >
                    <TableCell className="kb-cell-num">{index + 1}</TableCell>
                    <TableCell className="kb-cell-art">
                      <div className="kb-cell-art-inner" />
                    </TableCell>
                    <TableCell>
                      <div className="kb-tr-info">
                        <div className={`kb-tr-name${isCurrent ? " kb-tr-current-name" : ""}`}>
                          {track.name}
                        </div>
                        <div className="kb-tr-sub">
                          Track ·{" "}
                          <Link
                            href={`/user/${track.user_id}`}
                            className="kb-tr-uploader"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {track.user_display_name ?? `User #${track.user_id}`}
                          </Link>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="kb-cell-meta">
                      {Math.round(track.duration * 1000).toLocaleString()} ms
                    </TableCell>
                    <TableCell className="kb-cell-action">
                      <button
                        type="button"
                        className="kb-tr-play"
                        style={isCurrent ? { opacity: 1 } : undefined}
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePlay(track);
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
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

interface PlaylistCardProps {
  playlist: ApiPlaylist;
  creatorName: string | null;
}

function PlaylistCard({ playlist, creatorName }: PlaylistCardProps) {
  const router = useRouter();
  const initial = playlist.name[0]?.toUpperCase() ?? "?";

  return (
    <button
      type="button"
      className="kb-pl-card"
      onClick={() => router.push(`/playlist/${playlist.id}`)}
    >
      <div className="kb-pl-card-art">{initial}</div>
      <div className="kb-pl-card-name">{playlist.name}</div>
      <div className="kb-pl-card-sub">
        {creatorName ? `Created by ${creatorName}` : `User #${playlist.user_id}`}
      </div>
    </button>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Pause, Play } from "lucide-react";
import { api } from "@/lib/api-browser-client";
import { ApiPlaylist, ApiTrack, ApiUser } from "@/lib/types";
import { UserPlaylistsTable } from "@/components/user-playlists-table";
import { UserTracksTable } from "@/components/user-tracks-table";
import { useMusicPlayer } from "@/lib/contexts/music-player-context";

const TOP_LIMIT = 5;
// Server caps `limit` at 100 (api/src/config/config.ts: maxResultsPerPage).
const TRACK_FETCH_LIMIT = 100;

interface UserPageClientProps {
  user: ApiUser;
}

interface GreetingResp {
  greeting_track_id: number | null;
  greeting_playlist_id: number | null;
}

interface FarewellResp {
  farewell_track_id: number | null;
  farewell_playlist_id: number | null;
}

interface ResolvedRef {
  kind: "track" | "playlist";
  id: number;
  name: string | null;
  // The track to play when the user hits play. For a playlist ref this is the
  // playlist's first track (the player has no native playlist queueing yet).
  playableTrack: ApiTrack | null;
}

function formatJoined(iso: string): string {
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

async function resolveRef(trackId: number | null, playlistId: number | null): Promise<ResolvedRef | null> {
  if (trackId) {
    try {
      const res = await api.fetch(`/v1/tracks/${trackId}`);
      if (res.ok) {
        const track = (await res.json()) as ApiTrack;
        return { kind: "track", id: trackId, name: track.name ?? null, playableTrack: track };
      }
    } catch {
      /* fall through */
    }
    return { kind: "track", id: trackId, name: null, playableTrack: null };
  }
  if (playlistId) {
    let name: string | null = null;
    let firstTrack: ApiTrack | null = null;
    try {
      const [plRes, tracksRes] = await Promise.all([
        api.fetch(`/v1/playlists/${playlistId}`),
        api.tracks.fetch({ playlist_id: playlistId, limit: 1 }),
      ]);
      if (plRes.ok) {
        const pl = await plRes.json();
        name = pl.name ?? null;
      }
      firstTrack = tracksRes.data[0] ?? null;
    } catch {
      /* fall through */
    }
    return { kind: "playlist", id: playlistId, name, playableTrack: firstTrack };
  }
  return null;
}

export default function UserPageClient({ user }: UserPageClientProps) {
  const [tracks, setTracks] = useState<ApiTrack[]>([]);
  const [tracksTotal, setTracksTotal] = useState(0);
  const [playlists, setPlaylists] = useState<ApiPlaylist[]>([]);
  const [greeting, setGreeting] = useState<ResolvedRef | null>(null);
  const [farewell, setFarewell] = useState<ResolvedRef | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const [tracksRes, allPlaylists, greetingRes, farewellRes] = await Promise.all([
          api.tracks.fetch({ user_id: user.id, limit: TRACK_FETCH_LIMIT }),
          api.playlists.fetch(),
          api
            .fetch(`/v1/users/${user.id}/greeting`)
            .then((r) => (r.ok ? (r.json() as Promise<GreetingResp>) : null))
            .catch(() => null),
          api
            .fetch(`/v1/users/${user.id}/farewell`)
            .then((r) => (r.ok ? (r.json() as Promise<FarewellResp>) : null))
            .catch(() => null),
        ]);
        if (cancelled) return;
        setTracks(tracksRes.data);
        setTracksTotal(tracksRes.pagination.total);
        setPlaylists(allPlaylists.filter((p) => p.user_id === user.id));

        const [resolvedGreeting, resolvedFarewell] = await Promise.all([
          greetingRes ? resolveRef(greetingRes.greeting_track_id, greetingRes.greeting_playlist_id) : null,
          farewellRes ? resolveRef(farewellRes.farewell_track_id, farewellRes.farewell_playlist_id) : null,
        ]);
        if (cancelled) return;
        setGreeting(resolvedGreeting);
        setFarewell(resolvedFarewell);
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

  const topUploads = useMemo(
    () => [...tracks].sort((a, b) => b.total_play_count - a.total_play_count).slice(0, TOP_LIMIT),
    [tracks],
  );

  const latestTracks = useMemo(
    () => [...tracks].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, TOP_LIMIT),
    [tracks],
  );

  // Top playlists by newest. No play-count signal on ApiPlaylist yet.
  const topPlaylists = useMemo(
    () => [...playlists].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, TOP_LIMIT),
    [playlists],
  );

  // TODO(api): no per-user total-plays endpoint exists. Summing the first
  // page of tracks would under-count any user with > TRACK_FETCH_LIMIT uploads.
  const totalPlays = null as number | null;

  const displayName = user.discord_username ?? `User #${user.id}`;
  const initial = displayName[0]?.toUpperCase() ?? "?";

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
      <div className="kb-profile-hero">
        <div className="kb-profile-avatar">{initial}</div>
        <div>
          <div className="kb-profile-name">{displayName}</div>
          <div className="kb-profile-sub">
            Joined {formatJoined(user.created_at)} · ID <code>#{user.id}</code>
          </div>
        </div>
        <div className="kb-stats-row kb-stats-row-inline">
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
      </div>

      <div className="kb-grid-2col">
        <div>
          <div className="kb-section-header">
            <div className="kb-section-title">Top Tracks</div>
            <Link href={`/user/${user.id}/search?type=tracks`} className="kb-link-btn">
              See all →
            </Link>
          </div>
          <UserTracksTable tracks={topUploads} showPlays showCreated={false} showDuration={false} />
        </div>
        <div>
          <div className="kb-section-header">
            <div className="kb-section-title">Top Playlists</div>
            <Link href={`/user/${user.id}/search?type=playlists`} className="kb-link-btn">
              See all →
            </Link>
          </div>
          <UserPlaylistsTable
            playlists={topPlaylists}
            creatorName={user.discord_username ?? null}
            showPlays
            showCreated={false}
          />
        </div>
      </div>

      <div className="kb-grid-2col">
        <div>
          <div className="kb-section-header">
            <div className="kb-section-title">Latest Tracks</div>
            <Link href={`/user/${user.id}/search?type=tracks`} className="kb-link-btn">
              See all →
            </Link>
          </div>
          <UserTracksTable tracks={latestTracks} showPlays={false} showDuration={false} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div className="kb-section-header">
              <div className="kb-section-title">Greeting</div>
            </div>
            <GreetingFarewellCard entity={greeting} />
          </div>
          <div>
            <div className="kb-section-header">
              <div className="kb-section-title">Farewell</div>
            </div>
            <GreetingFarewellCard entity={farewell} />
          </div>
        </div>
      </div>

    </>
  );
}

function GreetingFarewellCard({ entity }: { entity: ResolvedRef | null }) {
  const { currentTrack, isPlaying, isLoading: playerLoading, playTrack, togglePlayPause } = useMusicPlayer();

  if (!entity) {
    return (
      <div className="kb-empty-state" style={{ padding: 16, fontSize: 12 }}>
        Not set.
      </div>
    );
  }

  const label = entity.name ?? `${entity.kind === "track" ? "Track" : "Playlist"} #${entity.id}`;
  const playable = entity.playableTrack;
  const isCurrent = !!playable && currentTrack?.id === playable.id;
  const isCurrentPlaying = isCurrent && isPlaying;
  const isCurrentLoading = isCurrent && playerLoading;

  const handlePlay = () => {
    if (!playable) return;
    if (isCurrent) {
      togglePlayPause();
    } else {
      playTrack(playable);
    }
  };

  return (
    <div className="kb-stat-card" style={{ textAlign: "left", padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
      <button
        type="button"
        className="kb-icon-toggle"
        onClick={handlePlay}
        disabled={!playable}
        title={!playable ? "No playable track" : isCurrentPlaying ? "Pause" : "Play"}
        aria-label={isCurrentPlaying ? "Pause" : "Play"}
        style={{ width: 36, height: 36, padding: 0, justifyContent: "center", flexShrink: 0 }}
      >
        {isCurrentLoading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : isCurrentPlaying ? (
          <Pause className="h-3 w-3" />
        ) : (
          <Play className="h-3 w-3" />
        )}
      </button>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="kb-stat-lbl" style={{ marginBottom: 2 }}>
          {entity.kind === "track" ? "Track" : "Playlist"}
        </div>
        {entity.kind === "playlist" ? (
          <Link
            href={`/playlist/${entity.id}`}
            className="kb-tr-uploader"
            style={{ fontSize: 14, fontWeight: 500, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {label}
          </Link>
        ) : (
          <div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {label}
          </div>
        )}
      </div>
    </div>
  );
}

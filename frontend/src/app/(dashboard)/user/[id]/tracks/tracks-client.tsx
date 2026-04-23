"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api-browser-client";
import { ApiTrack, ApiUser } from "@/lib/types";
import { UserTracksTable } from "@/components/user-tracks-table";

// Server caps `limit` at 100 (api/src/config/config.ts: maxResultsPerPage).
const TRACK_FETCH_LIMIT = 100;

interface UserTracksClientProps {
  user: ApiUser;
}

export default function UserTracksClient({ user }: UserTracksClientProps) {
  const [tracks, setTracks] = useState<ApiTrack[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await api.tracks.fetch({ user_id: user.id, limit: TRACK_FETCH_LIMIT });
        if (cancelled) return;
        setTracks(res.data);
      } catch (err) {
        console.error("Failed to load tracks", err);
        if (!cancelled) setError("Failed to load tracks.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  if (isLoading) {
    return (
      <div className="kb-empty-state">
        <Loader2 className="inline h-4 w-4 animate-spin" /> Loading tracks…
      </div>
    );
  }

  if (error) {
    return <div className="kb-empty-state" style={{ color: "hsl(var(--destructive))" }}>{error}</div>;
  }

  // TODO(api): paginate beyond TRACK_FETCH_LIMIT (no infinite scroll yet).
  return <UserTracksTable tracks={tracks} />;
}

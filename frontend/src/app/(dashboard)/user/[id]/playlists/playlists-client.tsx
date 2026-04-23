"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api-browser-client";
import { ApiPlaylist, ApiUser } from "@/lib/types";
import { UserPlaylistsTable } from "@/components/user-playlists-table";

interface UserPlaylistsClientProps {
  user: ApiUser;
}

export default function UserPlaylistsClient({ user }: UserPlaylistsClientProps) {
  const [playlists, setPlaylists] = useState<ApiPlaylist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const all = await api.playlists.fetch();
        if (cancelled) return;
        setPlaylists(all.filter((p) => p.user_id === user.id));
      } catch (err) {
        console.error("Failed to load playlists", err);
        if (!cancelled) setError("Failed to load playlists.");
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
        <Loader2 className="inline h-4 w-4 animate-spin" /> Loading playlists…
      </div>
    );
  }

  if (error) {
    return <div className="kb-empty-state" style={{ color: "hsl(var(--destructive))" }}>{error}</div>;
  }

  return (
    <UserPlaylistsTable
      playlists={playlists}
      creatorName={user.discord_username ?? null}
    />
  );
}

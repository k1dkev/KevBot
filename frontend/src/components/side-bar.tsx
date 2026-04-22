"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api-browser-client";
import { ApiPlaylist } from "@/lib/types";
import { useLibraryFilters } from "@/lib/contexts/library-filters-context";
import { useAuth } from "@/lib/contexts/auth-context";
import { Loader2 } from "lucide-react";

interface SbItemProps {
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  title?: string;
}

function SbItem({ active, disabled, onClick, children, title }: SbItemProps) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`kb-sb-item${active ? " kb-sb-active" : ""}`}
      style={disabled ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
    >
      {children}
    </button>
  );
}

export function SideBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const { setSelectedPlaylist, setSelectedUser, resetAll } = useLibraryFilters();

  const [playlists, setPlaylists] = useState<ApiPlaylist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const response = await api.playlists.fetch();
        if (cancelled) return;
        setPlaylists(response);
      } catch (err) {
        console.error("Failed to load playlists", err);
        if (!cancelled) {
          setError("Failed to load playlists");
          setPlaylists([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedPlaylists = useMemo(
    () => playlists.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [playlists]
  );

  const isActive = (path: string) => pathname === path;
  const isPlaylistActive = (id: number) => pathname === `/playlist/${id}`;

  const handlePlaylistClick = (playlist: ApiPlaylist) => {
    setSelectedPlaylist({ id: playlist.id, name: playlist.name });
    router.push(`/playlist/${playlist.id}`);
  };

  const handleMyUploads = () => {
    if (!user) return;
    setSelectedUser({
      id: user.id,
      discordId: user.discordId,
      displayName: user.discordUsername ?? null,
    });
    router.push("/myuploads");
  };

  const handleMyPlaylists = () => {
    if (!user) return;
    resetAll();
    router.push(`/user/${user.id}`);
  };

  return (
    <aside className="kb-sidebar">
      <div className="kb-sb-section-label">Library</div>
      <SbItem
        active={isActive("/myuploads")}
        disabled={!user}
        onClick={handleMyUploads}
        title={user ? undefined : "Log in to view your uploads"}
      >
        My Uploads
      </SbItem>
      <SbItem
        active={user ? isActive(`/user/${user.id}`) : false}
        disabled={!user}
        onClick={handleMyPlaylists}
        title={user ? undefined : "Log in to view your playlists"}
      >
        My Playlists
      </SbItem>
      <SbItem disabled title="Coming soon">
        My Play History
      </SbItem>

      <div className="kb-sb-section-label" style={{ marginTop: 20 }}>
        Playlists
      </div>
      {isLoading ? (
        <div className="kb-sb-item" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading…
        </div>
      ) : error ? (
        <div className="kb-sb-item" style={{ color: "var(--destructive)" }}>
          {error}
        </div>
      ) : sortedPlaylists.length === 0 ? (
        <div className="kb-sb-item">No playlists yet.</div>
      ) : (
        sortedPlaylists.map((pl) => (
          <SbItem key={pl.id} active={isPlaylistActive(pl.id)} onClick={() => handlePlaylistClick(pl)}>
            {pl.name}
          </SbItem>
        ))
      )}
    </aside>
  );
}

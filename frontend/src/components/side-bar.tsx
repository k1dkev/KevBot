"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api-browser-client";
import { ApiPlaylist } from "@/lib/types";
import { useLibraryFilters } from "@/lib/contexts/library-filters-context";
import { useAuth } from "@/lib/contexts/auth-context";
import { Loader2 } from "lucide-react";

export function SideBar() {
  const [playlists, setPlaylists] = useState<ApiPlaylist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const {
    selectedPlaylist,
    setSelectedPlaylist,
    clearSelectedPlaylist,
    selectedUser,
    setSelectedUser,
    clearSelectedUser,
    resetAll,
  } = useLibraryFilters();
  const { user } = useAuth();
  const router = useRouter();

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
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredPlaylists = useMemo(() => {
    if (!user) {
      return playlists;
    }
    return playlists.filter((playlist) => playlist.user_id === user.id);
  }, [playlists, user]);

  const sortedPlaylists = useMemo(
    () => filteredPlaylists.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [filteredPlaylists]
  );

  const handleSelectPlaylist = (playlist: ApiPlaylist) => {
    setSelectedPlaylist({ id: playlist.id, name: playlist.name });
    router.push(`/playlist/${playlist.id}`);
  };

  const isMyUploadsSelected = user ? selectedUser?.id === user.id : false;

  return (
    <div className="hidden bg-transparent md:block md:w-60 lg:w-72">
      <div className="flex h-full flex-col">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold">Library</h2>
        </div>
        <div className="px-4 py-3 space-y-2 border-b">
          <button
            type="button"
            onClick={() => {
              resetAll();
              router.push("/search");
            }}
            className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
              !selectedPlaylist && !selectedUser ? "bg-accent text-accent-foreground" : "hover:bg-accent hover:text-accent-foreground"
            }`}
          >
            All tracks
          </button>
          {user && (
            <button
              type="button"
              onClick={() => {
                setSelectedUser({
                  id: user.id,
                  discordId: user.discordId,
                  displayName: user.discordUsername ?? null,
                });
                router.push("/myuploads");
              }}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                isMyUploadsSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              My uploads
            </button>
          )}
          {selectedPlaylist && (
            <button
              type="button"
              onClick={clearSelectedPlaylist}
              className="text-xs text-muted-foreground underline"
            >
              Clear playlist filter
            </button>
          )}
          {selectedUser && user && isMyUploadsSelected && (
            <button
              type="button"
              onClick={clearSelectedUser}
              className="text-xs text-muted-foreground underline"
            >
              Clear user filter
            </button>
          )}
        </div>
        <div className="px-6 py-3 border-b">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Playlists</h3>
        </div>
        <ScrollArea className="flex-1 px-2">
          <div className="space-y-1 p-2">
            {isLoading ? (
              <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading playlists...
              </div>
            ) : error ? (
              <div className="px-3 py-2 text-sm text-destructive">{error}</div>
            ) : sortedPlaylists.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">No playlists yet.</div>
            ) : (
              sortedPlaylists.map((playlist) => {
                const isSelected = selectedPlaylist?.id === playlist.id;
                return (
                  <button
                    key={playlist.id}
                    type="button"
                    onClick={() => handleSelectPlaylist(playlist)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent hover:text-accent-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="truncate">{playlist.name}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

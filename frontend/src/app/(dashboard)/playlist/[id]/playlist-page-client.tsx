"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { LibrarySearchPanel } from "@/components/library-search-panel";
import { useSearchContext } from "@/lib/contexts/search-context";
import { ApiPlaylist } from "@/lib/types";

interface PlaylistPageClientProps {
  playlist: ApiPlaylist;
}

export default function PlaylistPageClient({ playlist }: PlaylistPageClientProps) {
  const router = useRouter();
  const { query } = useSearchContext();

  const handleNavigateUser = useCallback(
    (user: { id: number; displayName?: string | null; discordId: string }) => {
      router.push(`/user/${user.id}`);
    },
    [router]
  );

  return (
    <LibrarySearchPanel
      initialQuery={query}
      initialFilter="tracks"
      lockedFilter="tracks"
      playlistContext={{ id: playlist.id, name: playlist.name }}
      onNavigateToUser={handleNavigateUser}
      onClearPlaylist={() => router.replace("/search?type=tracks")}
    />
  );
}

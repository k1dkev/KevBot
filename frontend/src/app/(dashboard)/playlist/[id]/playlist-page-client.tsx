"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LibrarySearchPanel } from "@/components/library-search-panel";
import { ApiPlaylist, SearchFilter } from "@/lib/types";

interface PlaylistPageClientProps {
  playlist: ApiPlaylist;
  initialQuery: string;
}

export default function PlaylistPageClient({ playlist, initialQuery }: PlaylistPageClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentQuery = searchParams.get("q") ?? initialQuery ?? "";

  const handleStateChange = useCallback(
    ({ query, filter }: { query: string; filter: SearchFilter }) => {
      if (filter !== "tracks") {
        return;
      }
      const trimmed = query.trim();
      const existing = searchParams.get("q") ?? "";
      if (trimmed === existing) {
        return;
      }
      const nextPath = trimmed ? `${pathname}?q=${encodeURIComponent(trimmed)}` : pathname;
      router.replace(nextPath);
    },
    [pathname, router, searchParams]
  );

  const handleNavigateUser = useCallback(
    (user: { id: number; displayName?: string | null; discordId: string }) => {
      router.push(`/user/${user.id}`);
    },
    [router]
  );

  return (
    <LibrarySearchPanel
      initialQuery={currentQuery}
      initialFilter="tracks"
      lockedFilter="tracks"
      playlistContext={{ id: playlist.id, name: playlist.name }}
      onSearchStateChange={handleStateChange}
      onNavigateToUser={handleNavigateUser}
    />
  );
}


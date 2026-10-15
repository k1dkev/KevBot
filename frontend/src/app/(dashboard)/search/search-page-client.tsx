"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { LibrarySearchPanel } from "@/components/library-search-panel";
import { useSearchContext } from "@/lib/contexts/search-context";

export default function SearchPageClient() {
  const router = useRouter();
  const { query, type, setType } = useSearchContext();

  const handleNavigatePlaylist = useCallback(
    (playlist: { id: number; name: string }) => {
      router.push(`/playlist/${playlist.id}`);
    },
    [router]
  );

  const handleNavigateUser = useCallback(
    (user: { id: number; displayName?: string | null; discordId: string }) => {
      router.push(`/user/${user.id}`);
    },
    [router]
  );

  // The panel still owns its filter UI; we hand it the live filter from the
  // context and let it call back to update it. The query is read directly
  // from context (live, no debounce on the URL).
  return (
    <LibrarySearchPanel
      initialQuery={query}
      initialFilter={type}
      onFilterChangeExternal={setType}
      onNavigateToPlaylist={handleNavigatePlaylist}
      onNavigateToUser={handleNavigateUser}
    />
  );
}

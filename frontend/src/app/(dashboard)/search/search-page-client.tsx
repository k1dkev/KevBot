"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LibrarySearchPanel } from "@/components/library-search-panel";
import { SearchFilter } from "@/lib/types";

interface SearchPageClientProps {
  initialQuery: string;
  initialFilter: SearchFilter;
}

export default function SearchPageClient({ initialQuery, initialFilter }: SearchPageClientProps) {
  const router = useRouter();
  const pathname = usePathname();

  const normalizedInitialQuery = useMemo(() => initialQuery ?? "", [initialQuery]);
  const normalizedFilter = useMemo(() => initialFilter ?? "all", [initialFilter]);

  const handleStateChange = useCallback(
    ({ query, filter }: { query: string; filter: SearchFilter }) => {
      const trimmed = query.trim();
      let nextPath = "/search";

      if (trimmed) {
        nextPath += `/${encodeURIComponent(trimmed)}`;
        if (filter !== "all") {
          nextPath += `/${filter}`;
        }
      } else if (filter !== "all") {
        nextPath += `/${filter}`;
      }

      if (nextPath !== pathname) {
        router.replace(nextPath);
      }
    },
    [pathname, router]
  );

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

  return (
    <LibrarySearchPanel
      initialQuery={normalizedInitialQuery}
      initialFilter={normalizedFilter}
      onSearchStateChange={handleStateChange}
      onNavigateToPlaylist={handleNavigatePlaylist}
      onNavigateToUser={handleNavigateUser}
    />
  );
}


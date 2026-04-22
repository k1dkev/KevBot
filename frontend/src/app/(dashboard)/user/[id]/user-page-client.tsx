"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LibrarySearchPanel } from "@/components/library-search-panel";
import { ApiUser, SearchFilter } from "@/lib/types";

interface UserPageClientProps {
  user: ApiUser;
  initialQuery: string;
}

export default function UserPageClient({ user, initialQuery }: UserPageClientProps) {
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

  const handleNavigatePlaylist = useCallback(
    (playlist: { id: number; name: string }) => {
      router.push(`/playlist/${playlist.id}`);
    },
    [router]
  );

  return (
    <LibrarySearchPanel
      initialQuery={currentQuery}
      initialFilter="tracks"
      lockedFilter="tracks"
      userContext={{ id: user.id, displayName: user.discord_username ?? null, discordId: user.discord_id }}
      onSearchStateChange={handleStateChange}
      onNavigateToPlaylist={handleNavigatePlaylist}
    />
  );
}


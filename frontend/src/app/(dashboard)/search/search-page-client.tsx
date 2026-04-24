"use client";

import { useCallback, useEffect, useMemo } from "react";
import { notFound, usePathname, useRouter } from "next/navigation";
import { LibrarySearchPanel } from "@/components/library-search-panel";
import { SearchFilter } from "@/lib/types";

const FILTER_SEGMENTS: Record<string, SearchFilter> = {
  all: "all",
  tracks: "tracks",
  playlists: "playlists",
  users: "users",
};

interface ParsedSearchPath {
  initialQuery: string;
  initialFilter: SearchFilter;
}

function parseSearchPath(pathname: string): ParsedSearchPath {
  const segments = pathname
    .replace(/^\/search\/?/, "")
    .split("/")
    .filter(Boolean);
  let initialQuery = "";
  let initialFilter: SearchFilter = "tracks";

  if (segments.length === 0) {
    return { initialQuery, initialFilter };
  }
  if (segments.length === 1) {
    const maybeFilter = FILTER_SEGMENTS[segments[0]];
    if (maybeFilter) {
      initialFilter = maybeFilter;
    } else {
      initialQuery = decodeURIComponent(segments[0]);
    }
    return { initialQuery, initialFilter };
  }
  if (segments.length === 2) {
    initialQuery = decodeURIComponent(segments[0]);
    const candidate = FILTER_SEGMENTS[segments[1]];
    if (!candidate) notFound();
    return { initialQuery, initialFilter: candidate };
  }
  notFound();
}

export default function SearchPageClient() {
  const router = useRouter();
  const pathname = usePathname();

  const { initialQuery, initialFilter } = useMemo(() => parseSearchPath(pathname), [pathname]);

  // TEMP: detect whether the panel is remounting on URL navigation. Remove
  // once we've identified the source of the search-result flash.
  useEffect(() => {
    const id = Math.random().toString(36).slice(2, 7);
    console.log("[SearchPageClient] mount", id);
    return () => console.log("[SearchPageClient] unmount", id);
  }, []);

  const handleStateChange = useCallback(
    ({ query, filter }: { query: string; filter: SearchFilter }) => {
      const trimmed = query.trim();
      let nextPath = "/search";
      if (trimmed) {
        nextPath += `/${encodeURIComponent(trimmed)}`;
        if (filter !== "all") nextPath += `/${filter}`;
      } else if (filter !== "all") {
        nextPath += `/${filter}`;
      }
      if (nextPath !== pathname) {
        router.replace(nextPath);
      }
    },
    [pathname, router],
  );

  const handleNavigatePlaylist = useCallback(
    (playlist: { id: number; name: string }) => {
      router.push(`/playlist/${playlist.id}`);
    },
    [router],
  );

  const handleNavigateUser = useCallback(
    (user: { id: number; displayName?: string | null; discordId: string }) => {
      router.push(`/user/${user.id}`);
    },
    [router],
  );

  return (
    <LibrarySearchPanel
      initialQuery={initialQuery}
      initialFilter={initialFilter}
      onSearchStateChange={handleStateChange}
      onNavigateToPlaylist={handleNavigatePlaylist}
      onNavigateToUser={handleNavigateUser}
    />
  );
}

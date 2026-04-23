"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LibrarySearchPanel } from "@/components/library-search-panel";
import { ApiUser, SearchFilter } from "@/lib/types";

interface UserTracksClientProps {
  user: ApiUser;
}

export default function UserTracksClient({ user }: UserTracksClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const userBase = `/user/${user.id}`;

  const buildPath = (filter: SearchFilter, query: string) => {
    const trimmed = query.trim();
    const qSuffix = trimmed ? `?q=${encodeURIComponent(trimmed)}` : "";
    if (filter === "tracks") return `${userBase}/tracks${qSuffix}`;
    if (filter === "playlists") return `${userBase}/playlists${qSuffix}`;
    return `/search/users${qSuffix}`;
  };

  const handleStateChange = useCallback(
    ({ query, filter }: { query: string; filter: SearchFilter }) => {
      router.replace(buildPath(filter, query));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router, user.id]
  );

  return (
    <LibrarySearchPanel
      initialQuery={initialQuery}
      initialFilter="tracks"
      userContext={{
        id: user.id,
        displayName: user.discord_username ?? null,
        discordId: user.discord_id,
      }}
      onSearchStateChange={handleStateChange}
      onClearUser={() => router.replace("/search/tracks")}
    />
  );
}

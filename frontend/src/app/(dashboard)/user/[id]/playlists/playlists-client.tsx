"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { LibrarySearchPanel } from "@/components/library-search-panel";
import { useSearchContext } from "@/lib/contexts/search-context";
import { ApiUser, SearchFilter } from "@/lib/types";

interface UserPlaylistsClientProps {
  user: ApiUser;
}

export default function UserPlaylistsClient({ user }: UserPlaylistsClientProps) {
  const router = useRouter();
  const { query, setType } = useSearchContext();
  const userBase = `/user/${user.id}`;

  const handleFilterChange = useCallback(
    (filter: SearchFilter) => {
      setType(filter);
      if (filter === "tracks") router.push(`${userBase}/tracks`);
      else if (filter === "playlists") router.push(`${userBase}/playlists`);
      else if (filter === "users") router.push("/search?type=users");
    },
    [router, setType, userBase]
  );

  return (
    <LibrarySearchPanel
      initialQuery={query}
      initialFilter="playlists"
      userContext={{
        id: user.id,
        displayName: user.discord_username ?? null,
        discordId: user.discord_id,
      }}
      onFilterChangeExternal={handleFilterChange}
      onClearUser={() => router.replace("/search?type=playlists")}
    />
  );
}

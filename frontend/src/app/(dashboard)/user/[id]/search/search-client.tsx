"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { LibrarySearchPanel } from "@/components/library-search-panel";
import { useSearchContext } from "@/lib/contexts/search-context";
import { ApiUser, SearchFilter } from "@/lib/types";

const VALID: ReadonlyArray<SearchFilter> = ["all", "tracks", "playlists", "users"];

function parseType(raw: string | null): SearchFilter {
  if (raw && (VALID as ReadonlyArray<string>).includes(raw)) {
    return raw as SearchFilter;
  }
  return "tracks";
}

interface UserSearchClientProps {
  user: ApiUser;
}

export default function UserSearchClient({ user }: UserSearchClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { query } = useSearchContext();

  const initialFilter = parseType(searchParams.get("type"));
  const displayName = user.discord_username ?? `User #${user.id}`;
  const initial = displayName[0]?.toUpperCase() ?? "?";

  return (
    <div className="kb-view-fill">
      <div className="kb-user-search-header">
        <div className="kb-profile-hero">
          <div className="kb-profile-avatar">{initial}</div>
          <div>
            <div className="kb-profile-name">{displayName}</div>
            <Link
              href={`/user/${user.id}`}
              className="kb-link-btn"
              style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              <ArrowLeft className="h-3 w-3" /> Back to profile
            </Link>
          </div>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <LibrarySearchPanel
          initialQuery={query}
          initialFilter={initialFilter}
          userContext={{
            id: user.id,
            displayName: user.discord_username ?? null,
            discordId: user.discord_id,
          }}
          onNavigateToUser={(u) => router.push(`/user/${u.id}/search`)}
        />
      </div>
    </div>
  );
}

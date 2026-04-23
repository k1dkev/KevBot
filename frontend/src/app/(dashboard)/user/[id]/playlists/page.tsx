import { notFound } from "next/navigation";
import { getConfig } from "@/lib/config";
import { ApiUser } from "@/lib/types";
import UserPlaylistsClient from "./playlists-client";

interface UserPlaylistsPageProps {
  params: { id: string };
}

async function fetchUser(id: string): Promise<ApiUser> {
  const config = getConfig();
  const res = await fetch(`${config.apiUrl}/v1/users/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });

  if (res.status === 404) {
    notFound();
  }
  if (!res.ok) {
    throw new Error(`Failed to load user ${id}`);
  }

  return res.json();
}

export default async function UserPlaylistsPage({ params }: UserPlaylistsPageProps) {
  const user = await fetchUser(params.id);
  const displayName = user.discord_username ?? `User #${user.id}`;
  const initial = displayName[0]?.toUpperCase() ?? "?";

  return (
    <div className="kb-view">
      <div className="kb-profile-hero" style={{ marginBottom: 16 }}>
        <div className="kb-profile-avatar" style={{ width: 36, height: 36, fontSize: 14 }}>
          {initial}
        </div>
        <div>
          <div className="kb-profile-name" style={{ fontSize: 16 }}>{displayName}</div>
          <div className="kb-profile-sub">Playlists</div>
        </div>
      </div>
      <UserPlaylistsClient user={user} />
    </div>
  );
}

import { notFound } from "next/navigation";
import { getConfig } from "@/lib/config";
import { ApiUser } from "@/lib/types";
import UserPageClient from "./user-page-client";

interface UserPageProps {
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

function formatJoined(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export default async function UserPage({ params }: UserPageProps) {
  const user = await fetchUser(params.id);
  const displayName = user.discord_username ?? `User #${user.id}`;
  const initial = displayName[0]?.toUpperCase() ?? "?";

  return (
    <div className="kb-view">
      <div className="kb-profile-hero">
        <div className="kb-profile-avatar">{initial}</div>
        <div>
          <div className="kb-profile-name">{displayName}</div>
          <div className="kb-profile-sub">
            Joined {formatJoined(user.created_at)} · Discord ID <code>{user.discord_id}</code>
          </div>
        </div>
      </div>
      <UserPageClient user={user} />
    </div>
  );
}

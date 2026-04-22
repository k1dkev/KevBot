import { notFound } from "next/navigation";
import { getConfig } from "@/lib/config";
import { ApiUser } from "@/lib/types";
import UserPageClient from "./user-page-client";

interface UserPageProps {
  params: { id: string };
  searchParams?: { q?: string };
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

export default async function UserPage({ params, searchParams }: UserPageProps) {
  const user = await fetchUser(params.id);
  const initialQuery = searchParams?.q ?? "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {user.discord_username ?? `User #${user.id}`}
        </h1>
        <p className="text-muted-foreground">
          Joined {new Date(user.created_at).toLocaleDateString()} · Discord ID {user.discord_id}
        </p>
      </div>
      <UserPageClient user={user} initialQuery={initialQuery} />
    </div>
  );
}


import { notFound } from "next/navigation";
import { getConfig } from "@/lib/config";
import { ApiUser } from "@/lib/types";
import UserTracksClient from "./tracks-client";

interface UserTracksPageProps {
  params: Promise<{ id: string }>;
}

async function fetchUser(id: string): Promise<ApiUser> {
  const config = getConfig();
  const res = await fetch(`${config.apiUrl}/v1/users/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`Failed to load user ${id}`);
  return res.json();
}

export default async function UserTracksPage({ params }: UserTracksPageProps) {
  const { id } = await params;
  const user = await fetchUser(id);
  return <UserTracksClient user={user} />;
}

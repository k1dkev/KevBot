import { notFound } from "next/navigation";
import { getConfig } from "@/lib/config";
import { ApiUser } from "@/lib/types";
import { ApiClientError, createApiClient } from "@kevbot/api-client";
import UserPageClient from "./user-page-client";

interface UserPageProps {
  params: Promise<{ id: string }>;
}

async function fetchUser(id: string): Promise<ApiUser> {
  const config = getConfig();
  const api = createApiClient({ baseUrl: config.apiUrl });
  try {
    return await api.request<ApiUser>(`/v1/users/${encodeURIComponent(id)}`, { cache: "no-store" });
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) notFound();
    throw new Error(`Failed to load user ${id}`);
  } finally {
    api.close();
  }
}

export default async function UserPage({ params }: UserPageProps) {
  const { id } = await params;
  const user = await fetchUser(id);

  return (
    <div className="kb-view">
      <UserPageClient user={user} />
    </div>
  );
}

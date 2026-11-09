import { notFound } from "next/navigation";
import { getConfig } from "@/lib/config";
import { ApiPlaylist } from "@/lib/types";
import { ApiClientError, createApiClient } from "@kevbot/api-client";
import PlaylistPageClient from "./playlist-page-client";

interface PlaylistPageProps {
  params: Promise<{ id: string }>;
}

async function fetchPlaylist(id: string): Promise<ApiPlaylist> {
  const config = getConfig();
  const api = createApiClient({ baseUrl: config.apiUrl });
  try {
    return await api.request<ApiPlaylist>(`/v1/playlists/${encodeURIComponent(id)}`, { cache: "no-store" });
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) notFound();
    throw new Error(`Failed to load playlist ${id}`);
  } finally {
    api.close();
  }
}

export default async function PlaylistPage({ params }: PlaylistPageProps) {
  const { id } = await params;
  const playlist = await fetchPlaylist(id);

  return (
    <div className="kb-view">
      <PlaylistPageClient playlist={playlist} />
    </div>
  );
}

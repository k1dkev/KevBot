import { notFound } from "next/navigation";
import { getConfig } from "@/lib/config";
import { ApiPlaylist } from "@/lib/types";
import PlaylistPageClient from "./playlist-page-client";

interface PlaylistPageProps {
  params: Promise<{ id: string }>;
}

async function fetchPlaylist(id: string): Promise<ApiPlaylist> {
  const config = getConfig();
  const res = await fetch(`${config.apiUrl}/v1/playlists/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });

  if (res.status === 404) {
    notFound();
  }
  if (!res.ok) {
    throw new Error(`Failed to load playlist ${id}`);
  }

  return res.json();
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

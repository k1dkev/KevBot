import { notFound } from "next/navigation";
import { getConfig } from "@/lib/config";
import { ApiPlaylist } from "@/lib/types";
import PlaylistPageClient from "./playlist-page-client";

interface PlaylistPageProps {
  params: { id: string };
  searchParams?: { q?: string };
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

export default async function PlaylistPage({ params, searchParams }: PlaylistPageProps) {
  const playlist = await fetchPlaylist(params.id);
  const initialQuery = searchParams?.q ?? "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{playlist.name}</h1>
        <p className="text-muted-foreground">
          Created at {new Date(playlist.created_at).toLocaleDateString()} · Owned by user #{playlist.user_id}
        </p>
      </div>
      <PlaylistPageClient playlist={playlist} initialQuery={initialQuery} />
    </div>
  );
}


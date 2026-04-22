import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SearchFilter } from "@/lib/types";
import SearchPageClient from "../search-page-client";

const FILTER_SEGMENTS: Record<string, SearchFilter> = {
  tracks: "tracks",
  playlists: "playlists",
  users: "users",
};

interface SearchPageProps {
  params: {
    segments?: string[];
  };
}

export default function SearchPage({ params }: SearchPageProps) {
  const segments = params.segments ?? [];
  let initialQuery = "";
  let initialFilter: SearchFilter = "all";

  if (segments.length === 0) {
    // defaults already set
  } else if (segments.length === 1) {
    const maybeFilter = FILTER_SEGMENTS[segments[0]];
    if (maybeFilter) {
      initialFilter = maybeFilter;
    } else {
      initialQuery = decodeURIComponent(segments[0]);
    }
  } else if (segments.length === 2) {
    initialQuery = decodeURIComponent(segments[0]);
    const candidate = FILTER_SEGMENTS[segments[1]];
    if (!candidate) {
      notFound();
    }
    initialFilter = candidate!;
  } else {
    notFound();
  }

  return (
    <Suspense fallback={null}>
      <SearchPageClient initialQuery={initialQuery} initialFilter={initialFilter} />
    </Suspense>
  );
}

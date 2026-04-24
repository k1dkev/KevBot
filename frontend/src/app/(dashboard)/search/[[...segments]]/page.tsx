"use client";

import { useEffect } from "react";
import SearchPageClient from "../search-page-client";

// Render the client wrapper with no props. The wrapper reads pathname via
// usePathname() so that navigating between /search/foo/tracks and
// /search/bar/tracks doesn't re-instantiate the server tree (which was
// remounting LibrarySearchPanel and causing a visible flash).
export default function SearchPage() {
  // TEMP: detect whether the panel is remounting on URL navigation. Remove
  // once we've identified the source of the search-result flash.
  useEffect(() => {
    const id = Math.random().toString(36).slice(2, 7);
    console.log("[SearchPage] mount", id);
    return () => console.log("[SearchPage] unmount", id);
  }, []);

  return <SearchPageClient />;
}

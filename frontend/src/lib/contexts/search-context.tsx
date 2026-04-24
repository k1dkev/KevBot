"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchFilter } from "@/lib/types";

interface SearchContextValue {
  // Live, uncommitted search input state — driven by the NavBar input.
  query: string;
  setQuery: (q: string) => void;
  type: SearchFilter;
  setType: (t: SearchFilter) => void;
  // Push the current live state into the URL (committed, shareable).
  // For /search this is `/search?q=...&type=...`; for other pages it's a
  // navigation to /search with those params.
  commitToUrl: () => void;
}

const SearchContext = createContext<SearchContextValue | null>(null);

const VALID_TYPES: ReadonlyArray<SearchFilter> = ["all", "tracks", "playlists", "users"];

function parseType(raw: string | null | undefined): SearchFilter {
  if (raw && (VALID_TYPES as ReadonlyArray<string>).includes(raw)) {
    return raw as SearchFilter;
  }
  return "tracks";
}

export function SearchProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Seed live state from the URL on mount and whenever the pathname changes
  // (i.e. the user navigated to a different route — e.g. clicked a link, hit
  // back/forward, or pasted a URL). Live edits within the same pathname are
  // not echoed back from the URL because we never write to the URL while
  // typing.
  const initialQuery = searchParams?.get("q") ?? "";
  const initialType = parseType(searchParams?.get("type"));
  const [query, setQuery] = useState(initialQuery);
  const [type, setType] = useState<SearchFilter>(initialType);

  const lastPathnameRef = useRef(pathname);
  useEffect(() => {
    if (pathname === lastPathnameRef.current) return;
    lastPathnameRef.current = pathname;
    setQuery(searchParams?.get("q") ?? "");
    setType(parseType(searchParams?.get("type")));
  }, [pathname, searchParams]);

  const commitToUrl = useCallback(() => {
    const trimmed = query.trim();
    const params = new URLSearchParams();
    if (trimmed) params.set("q", trimmed);
    if (type !== "all") params.set("type", type);
    const qs = params.toString();
    const target = `/search${qs ? `?${qs}` : ""}`;
    router.replace(target);
  }, [query, router, type]);

  const value = useMemo<SearchContextValue>(
    () => ({ query, setQuery, type, setType, commitToUrl }),
    [commitToUrl, query, type]
  );

  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

export function useSearchContext(): SearchContextValue {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error("useSearchContext must be used inside SearchProvider");
  return ctx;
}

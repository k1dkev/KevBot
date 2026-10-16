"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchFilter, SearchOrder, SearchSort } from "@/lib/types";
import {
  canonicalSearchHref,
  normalizeSearchSort,
  readSearchDraft,
  SearchDraft,
  searchHref,
} from "@/lib/search/search-navigation";

interface SearchContextValue {
  // Live, uncommitted search input state — driven by the NavBar input.
  query: string;
  setQuery: (q: string) => void;
  type: SearchFilter;
  setType: (t: SearchFilter) => void;
  sort: SearchSort;
  setSort: (sort: SearchSort) => void;
  order: SearchOrder;
  setOrder: (order: SearchOrder) => void;
  includeDeleted: boolean;
  setIncludeDeleted: (includeDeleted: boolean) => void;
  // Push the current live state into the URL (committed, shareable).
  // Keep a search panel's route scope; other pages navigate to /search.
  commitToUrl: () => void;
}

const SearchContext = createContext<SearchContextValue | null>(null);

export function SearchProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const paramsString = searchParams.toString();
  const location = `${pathname}?${paramsString}`;
  const [state, setState] = useState(() => ({
    location,
    draft: readSearchDraft(pathname, new URLSearchParams(paramsString)),
  }));
  // Reconcile before children render, including same-path links and history
  // navigation. Ordinary typing never changes location, so drafts stay live.
  let draft = state.draft;
  if (state.location !== location) {
    draft = readSearchDraft(pathname, new URLSearchParams(paramsString));
    setState({ location, draft });
  }

  // There is no mixed-results tab. Make unsupported incoming types explicit
  // in the URL as well as in the input, active tab and API request.
  useEffect(() => {
    const target = canonicalSearchHref(pathname, new URLSearchParams(paramsString));
    if (target) router.replace(target, { scroll: false });
  }, [paramsString, pathname, router]);

  const setQuery = useCallback((query: string) => {
    setState((previous) => ({ ...previous, draft: { ...previous.draft, query } }));
  }, []);

  const updateOptions = useCallback(
    (options: Partial<SearchDraft>) => {
      const href = searchHref(pathname, new URLSearchParams(paramsString), { ...draft, ...options });
      const next = readSearchDraft(href.split("?")[0], new URLSearchParams(href.split("?")[1]));
      setState({ location, draft: next });
      router.push(href, { scroll: false });
    },
    [draft, location, paramsString, pathname, router],
  );

  const setType = useCallback((type: SearchFilter) => updateOptions({ type }), [updateOptions]);
  const setSort = useCallback((sort: SearchSort) => updateOptions({ sort }), [updateOptions]);
  const setOrder = useCallback((order: SearchOrder) => updateOptions({ order }), [updateOptions]);
  const setIncludeDeleted = useCallback(
    (includeDeleted: boolean) => updateOptions({ includeDeleted }),
    [updateOptions],
  );

  const commitToUrl = useCallback(() => {
    updateOptions({});
  }, [updateOptions]);

  const { query, type, order, includeDeleted } = draft;
  const sort = normalizeSearchSort(draft.sort, query, type);

  const value = useMemo<SearchContextValue>(
    () => ({
      query,
      setQuery,
      type,
      setType,
      sort,
      setSort,
      order,
      setOrder,
      includeDeleted,
      setIncludeDeleted,
      commitToUrl,
    }),
    [commitToUrl, query, setQuery, type, setType, sort, setSort, order, setOrder, includeDeleted, setIncludeDeleted],
  );

  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

export function useSearchContext(): SearchContextValue {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error("useSearchContext must be used inside SearchProvider");
  return ctx;
}

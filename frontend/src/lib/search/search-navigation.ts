import type { SearchFilter, SearchOrder, SearchSort } from "../types";

export interface SearchDraft {
  query: string;
  type: SearchFilter;
  // An absent sort follows the live query until the user explicitly chooses one.
  sort?: SearchSort;
  order: SearchOrder;
  includeDeleted: boolean;
}

export function isSearchRoute(pathname: string): boolean {
  return pathname === "/search" || /^\/user\/\d+\/search$/.test(pathname) || /^\/playlist\/\d+$/.test(pathname);
}

export function searchScopeId(raw: string | null): number | undefined {
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

export function normalizeSearchType(raw: string | null | undefined): SearchFilter {
  return raw === "playlists" || raw === "users" ? raw : "tracks";
}

export function normalizeSearchSort(sort: SearchSort | undefined, query: string, type: SearchFilter): SearchSort {
  const fallback = query.trim() ? "relevance" : "name";
  if (sort === "relevance" && !query.trim()) return "name";
  if (sort === "play_count" && type !== "tracks") return fallback;
  return sort ?? fallback;
}

export function routeSearchType(pathname: string, params: URLSearchParams, raw: string | null): SearchFilter {
  const type = normalizeSearchType(raw);
  if (/^\/playlist\/\d+$/.test(pathname) || searchScopeId(params.get("playlist_id"))) return "tracks";
  if (type === "users" && (/^\/user\/\d+\/search$/.test(pathname) || searchScopeId(params.get("user_id")))) return "tracks";
  return type;
}

export function readSearchDraft(pathname: string, params: URLSearchParams): SearchDraft {
  const rawSort = params.get("sort");
  const sort = rawSort === "relevance" || rawSort === "name" || rawSort === "created_at" || rawSort === "play_count"
    ? rawSort : undefined;
  const query = params.get("q") ?? "";
  const type = routeSearchType(pathname, params, params.get("type"));
  return {
    query,
    type,
    sort: params.has("sort") ? normalizeSearchSort(sort, query, type) : undefined,
    order: params.get("order") === "asc" ? "asc" : "desc",
    includeDeleted: params.get("include_deleted") === "true" || params.get("include_deleted") === "1",
  };
}

export function canonicalSearchHref(pathname: string, currentParams: URLSearchParams): string | null {
  if (!isSearchRoute(pathname)) return null;
  const params = new URLSearchParams(currentParams);
  const draft = readSearchDraft(pathname, params);
  if (params.has("type")) params.set("type", draft.type);
  if (params.has("sort")) params.set("sort", normalizeSearchSort(draft.sort, draft.query, draft.type));
  if (params.has("include_deleted") && !draft.includeDeleted) params.delete("include_deleted");
  if (params.toString() === currentParams.toString()) return null;
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}`;
}

export function searchHref(pathname: string, currentParams: URLSearchParams, draft: SearchDraft): string {
  const target = isSearchRoute(pathname) ? pathname : "/search";
  const params = isSearchRoute(pathname) ? new URLSearchParams(currentParams) : new URLSearchParams();
  const query = draft.query.trim();
  if (query) params.set("q", query);
  else params.delete("q");
  const type = normalizeSearchType(draft.type);
  // These scopes are invalid for other tabs; route scopes are locked by the UI.
  if (type !== "tracks") params.delete("playlist_id");
  if (type === "users") params.delete("user_id");
  const normalizedType = routeSearchType(target, params, type);
  params.set("type", normalizedType);
  if (draft.sort) params.set("sort", normalizeSearchSort(draft.sort, query, normalizedType));
  else params.delete("sort");
  params.set("order", draft.order);
  if (draft.includeDeleted) params.set("include_deleted", "true");
  else params.delete("include_deleted");
  // A changed search always starts from its first page.
  params.delete("offset");
  return `${target}?${params.toString()}`;
}

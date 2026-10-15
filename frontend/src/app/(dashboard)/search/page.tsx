import SearchPageClient from "./search-page-client";

// Stable, propless server entry. Search state lives entirely in the
// SearchProvider context (initialized from URL search params), so this
// component renders identical JSX on every navigation and never causes the
// search panel subtree to remount.
export default function SearchPage() {
  return <SearchPageClient />;
}

"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { useAuth } from "@/lib/contexts/auth-context";

const FILTER_SEGMENTS = new Set(["all", "tracks", "playlists", "users"]);
const NAV_DEBOUNCE_MS = 150;

function readQueryFromUrl(pathname: string, searchParams: URLSearchParams | null): string {
  if (pathname.startsWith("/search")) {
    const segments = pathname.split("/").filter(Boolean); // ["search", ...]
    if (segments.length >= 2 && !FILTER_SEGMENTS.has(segments[1])) {
      return decodeURIComponent(segments[1]);
    }
    return "";
  }
  return searchParams?.get("q") ?? "";
}

function buildSearchPath(pathname: string, query: string): string {
  const trimmed = query.trim();
  const encoded = trimmed ? encodeURIComponent(trimmed) : "";

  if (pathname.startsWith("/search")) {
    const segments = pathname.split("/").filter(Boolean);
    const lastSegment = segments[segments.length - 1];
    const filter = lastSegment && FILTER_SEGMENTS.has(lastSegment) ? lastSegment : null;
    if (encoded) return filter ? `/search/${encoded}/${filter}` : `/search/${encoded}`;
    return filter ? `/search/${filter}` : "/search";
  }

  if (pathname.startsWith("/user/") || pathname.startsWith("/playlist/")) {
    return encoded ? `${pathname}?q=${encoded}` : pathname;
  }

  // Homepage and any other pages — escalate to global search.
  return encoded ? `/search/${encoded}/tracks` : "/search/tracks";
}

export function NavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { isAuthenticated, user, login, logout } = useAuth();

  const urlQuery = useMemo(
    () => readQueryFromUrl(pathname, searchParams),
    [pathname, searchParams]
  );
  const [q, setQ] = useState(urlQuery);

  // Sync local input with URL when the page changes underneath us.
  useEffect(() => {
    setQ(urlQuery);
  }, [urlQuery]);

  // Debounce navigation so typing doesn't fire one router.replace per keystroke.
  useEffect(() => {
    if (q === urlQuery) return;
    const timer = setTimeout(() => {
      const nextPath = buildSearchPath(pathname, q);
      const isStaying = pathname.startsWith("/search") || pathname.startsWith("/user/") || pathname.startsWith("/playlist/");
      if (isStaying) {
        router.replace(nextPath);
      } else {
        router.push(nextPath);
      }
    }, NAV_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [pathname, q, router, urlQuery]);

  const isDark = (resolvedTheme ?? theme) === "dark";

  return (
    <header className="kb-topbar">
      <div className="kb-topbar-left">
        <span className="kb-brand" onClick={() => router.push("/")}>
          KevBot
        </span>
      </div>
      <div className="kb-topbar-center">
        <button type="button" className="kb-tb-btn" onClick={() => router.push("/")}>
          Home
        </button>
        <div className="kb-topbar-search">
          <input
            className="kb-search-input"
            placeholder="Search tracks, playlists, or users…"
            value={q}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
            aria-label="Global search"
          />
        </div>
      </div>
      <div className="kb-topbar-right">
        <button
          type="button"
          className="kb-tb-btn kb-theme-toggle"
          onClick={() => setTheme(isDark ? "light" : "dark")}
          aria-label="Toggle theme"
        >
          {isDark ? "☀" : "☾"}
        </button>
        {isAuthenticated && user ? (
          <>
            <button
              type="button"
              className="kb-user-pill"
              onClick={() => router.push(`/user/${user.id}`)}
            >
              <span className="kb-user-dot" />
              {user.discordUsername}
            </button>
            <button type="button" className="kb-tb-btn kb-logout-btn" onClick={() => void logout()}>
              Logout
            </button>
          </>
        ) : (
          <button type="button" className="kb-search-btn" onClick={() => login()}>
            Login
          </button>
        )}
      </div>
    </header>
  );
}

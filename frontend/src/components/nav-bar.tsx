"use client";

import { ChangeEvent, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useAuth } from "@/lib/contexts/auth-context";
import { useSearchContext } from "@/lib/contexts/search-context";

export function NavBar() {
  const router = useRouter();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { isAuthenticated, user, login, logout } = useAuth();
  const { query, setQuery, commitToUrl } = useSearchContext();

  const isDark = (resolvedTheme ?? theme) === "dark";

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitToUrl();
    }
  };

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
            value={query}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
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

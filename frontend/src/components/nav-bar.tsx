"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useAuth } from "@/lib/contexts/auth-context";

export function NavBar() {
  const router = useRouter();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { isAuthenticated, user, login, logout } = useAuth();
  const [q, setQ] = useState("");

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = q.trim();
    if (trimmed) {
      router.push(`/search/${encodeURIComponent(trimmed)}`);
    } else {
      router.push("/search");
    }
  };

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
        <form className="kb-topbar-search" onSubmit={handleSearch}>
          <input
            className="kb-search-input"
            placeholder="Search tracks, playlists, or users…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Global search"
          />
          <button type="submit" className="kb-search-btn">
            Search
          </button>
        </form>
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

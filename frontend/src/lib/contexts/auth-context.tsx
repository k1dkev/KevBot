"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { getConfig } from "@/lib/config";
import { api, UnauthenticatedError } from "@/lib/api-browser-client";
import { logger } from "@/lib/logging/browser";

const log = logger.child({ component: "auth" });

// TODO(discord-auth): where is the session stored or used, should that not be in the auth context?

interface User {
  id: number;
  discordId: string;
  discordUsername: string;
  discordAvatarHash: string;
}

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  isLoading: boolean;
}

interface AuthActions {
  login: (options?: { redirect?: string }) => void;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

type AuthContextType = AuthState & AuthActions;

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    isLoading: true,
  });
  const sessionRequestRef = useRef<Promise<void> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadSession = useCallback(async () => {
    // if a session request is already in progress, wait for it to complete
    if (sessionRequestRef.current) {
      await sessionRequestRef.current;
      return;
    }

    const request = (async () => {
      setState((prev) => ({
        ...prev,
        isLoading: true,
      }));

      // TODO: this gets called on auth/discord/callback load before the exchange code is completed, so the user is not authenticated yet. which results in some console error spam.
      try {
        const data = await api.auth.fetchMe();
        if (!isMountedRef.current) return;
        setState({
          isAuthenticated: true,
          user: {
            id: data.user.id,
            discordId: data.user.discord_id,
            discordUsername: data.user.discord_username,
            discordAvatarHash: data.user.discord_avatar_hash,
          },
          isLoading: false,
        });
      } catch (error) {
        // TODO: very specific error handling here. Not a fan of this. I'd prefer a more general approach.
        if (!(error instanceof UnauthenticatedError)) {
          // Unexpected errors should still be surfaced for debugging.
          log.error({ err: error }, "auth.profile.failed");
        }
        if (!isMountedRef.current) return;
        setState({
          isAuthenticated: false,
          user: null,
          isLoading: false,
        });
      }
    })();

    sessionRequestRef.current = request.finally(() => {
      sessionRequestRef.current = null;
    });

    await sessionRequestRef.current;
  }, []);

  useEffect(() => {
    const unsubscribe = api.authEvents.subscribe((event) => {
      if (!isMountedRef.current) return;
      if (event.type === "authenticated") {
        void loadSession();
      } else if (event.type === "unauthenticated") {
        setState({
          isAuthenticated: false,
          user: null,
          isLoading: false,
        });
      }
    });

    void loadSession();

    return () => {
      unsubscribe();
    };
  }, [loadSession]);

  const checkAuth = useCallback(async () => {
    await loadSession();
  }, [loadSession]);

  const login = useCallback((options?: { redirect?: string }) => {
    const config = getConfig();
    // TODO(discord-auth): why not just have a config for the entire discord URL instead of constructing it here
    // TODO(discord-auth): There should be a detected config for redirect URL
    const redirectTarget = options?.redirect && options.redirect.startsWith("/") ? options.redirect : "/tracks";

    const stateKey = (() => {
      try {
        // TODO: do i really need to catch this error?
        return crypto.randomUUID();
      } catch {
        return Math.random().toString(36).slice(2);
      }
    })();

    try {
      sessionStorage.setItem(`oauth-state:${stateKey}`, JSON.stringify({ redirect: redirectTarget }));
    } catch (error) {
      log.warn({ err: error }, "auth.redirect.persist.failed");
    }

    const params = new URLSearchParams({
      client_id: config.discordOAuth2ClientId,
      redirect_uri: `${config.frontendUrl}/auth/discord/callback`,
      response_type: "code",
      scope: "identify",
      state: stateKey,
    });
    window.location.href = `${config.discordOAuth2AuthUrl}?${params.toString()}`;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch (error) {
      log.warn({ err: error }, "auth.logout.failed");
    } finally {
      setState({
        isAuthenticated: false,
        user: null,
        isLoading: false,
      });
    }
  }, []);

  const value: AuthContextType = {
    ...state,
    login,
    logout,
    checkAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

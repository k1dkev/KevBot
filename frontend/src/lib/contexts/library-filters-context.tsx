"use client";

import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from "react";

interface SelectedPlaylist {
  id: number;
  name: string;
}

interface SelectedUser {
  id: number;
  discordId: string;
  displayName: string | null;
}

interface LibraryFiltersContextValue {
  selectedPlaylist: SelectedPlaylist | null;
  setSelectedPlaylist: (playlist: SelectedPlaylist | null) => void;
  clearSelectedPlaylist: () => void;
  selectedUser: SelectedUser | null;
  setSelectedUser: (user: SelectedUser | null) => void;
  clearSelectedUser: () => void;
  resetAll: () => void;
}

const LibraryFiltersContext = createContext<LibraryFiltersContextValue | undefined>(undefined);

interface LibraryFiltersProviderProps {
  children: ReactNode;
}

export function LibraryFiltersProvider({ children }: LibraryFiltersProviderProps) {
  const [selectedPlaylist, setSelectedPlaylistState] = useState<SelectedPlaylist | null>(null);
  const [selectedUser, setSelectedUserState] = useState<SelectedUser | null>(null);

  const setSelectedPlaylist = useCallback((playlist: SelectedPlaylist | null) => {
    setSelectedPlaylistState(playlist);
  }, []);

  const clearSelectedPlaylist = useCallback(() => {
    setSelectedPlaylistState(null);
  }, []);

  const setSelectedUser = useCallback((user: SelectedUser | null) => {
    setSelectedUserState(user);
  }, []);

  const clearSelectedUser = useCallback(() => {
    setSelectedUserState(null);
  }, []);

  const resetAll = useCallback(() => {
    setSelectedPlaylistState(null);
    setSelectedUserState(null);
  }, []);

  const value = useMemo<LibraryFiltersContextValue>(
    () => ({
      selectedPlaylist,
      setSelectedPlaylist,
      clearSelectedPlaylist,
      selectedUser,
      setSelectedUser,
      clearSelectedUser,
      resetAll,
    }),
    [
      selectedPlaylist,
      setSelectedPlaylist,
      clearSelectedPlaylist,
      selectedUser,
      setSelectedUser,
      clearSelectedUser,
      resetAll,
    ]
  );

  return <LibraryFiltersContext.Provider value={value}>{children}</LibraryFiltersContext.Provider>;
}

export function useLibraryFilters() {
  const context = useContext(LibraryFiltersContext);
  if (!context) {
    throw new Error("useLibraryFilters must be used within a LibraryFiltersProvider");
  }
  return context;
}


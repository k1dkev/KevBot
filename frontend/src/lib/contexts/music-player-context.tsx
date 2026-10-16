"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { ApiTrack } from "@/lib/types";
import { api } from "@/lib/api-browser-client";
import { logger } from "@/lib/logging/browser";

const log = logger.child({ component: "playback" });

interface MusicPlayerState {
  currentTrack: ApiTrack | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isLoading: boolean;
}

interface MusicPlayerActions {
  playTrack: (track: ApiTrack) => void;
  pauseTrack: () => void;
  resumeTrack: () => void;
  seekTo: (time: number) => void;
  setVolume: (volume: number) => void;
  togglePlayPause: () => void;
}

type MusicPlayerContextType = MusicPlayerState & MusicPlayerActions;

const MusicPlayerContext = createContext<MusicPlayerContextType | undefined>(undefined);

export function useMusicPlayer() {
  const context = useContext(MusicPlayerContext);
  if (!context) {
    throw new Error("useMusicPlayer must be used within a MusicPlayerProvider");
  }
  return context;
}

interface MusicPlayerProviderProps {
  children: React.ReactNode;
}

export function MusicPlayerProvider({ children }: MusicPlayerProviderProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<MusicPlayerState>({
    currentTrack: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 0.75,
    isLoading: false,
  });

  // Initialize audio element
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audioRef.current = audio;

    const updateTime = () => {
      setState((prev) => ({ ...prev, currentTime: audio.currentTime }));
    };

    const updateDuration = () => {
      setState((prev) => ({ ...prev, duration: audio.duration || 0 }));
    };

    const handleLoadStart = () => {
      setState((prev) => ({ ...prev, isLoading: true }));
    };

    const handleCanPlay = () => {
      setState((prev) => ({ ...prev, isLoading: false }));
    };

    const handlePlay = () => {
      setState((prev) => ({ ...prev, isPlaying: true }));
    };

    const handlePause = () => {
      setState((prev) => ({ ...prev, isPlaying: false }));
    };

    const handleEnded = () => {
      setState((prev) => ({ ...prev, isPlaying: false, currentTime: 0 }));
    };

    const handleError = () => {
      log.error({ mediaErrorCode: audio.error?.code }, "playback.audio.failed");
      setState((prev) => ({ ...prev, isLoading: false, isPlaying: false }));
    };

    // Event listeners
    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("durationchange", updateDuration);
    audio.addEventListener("loadstart", handleLoadStart);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("durationchange", updateDuration);
      audio.removeEventListener("loadstart", handleLoadStart);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, []);

  // Update volume when state changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = state.volume;
    }
  }, [state.volume]);

  const playTrack = (track: ApiTrack) => {
    if (audioRef.current) {
      // Use stream endpoint for better performance
      audioRef.current.src = api.tracks.streamUrl(track.id);
      setState((prev) => ({
        ...prev,
        currentTrack: track,
        currentTime: 0,
        isLoading: true,
      }));
      audioRef.current.play().catch((err) => log.warn({ err, trackId: track.id }, "playback.play.failed"));
    }
  };

  const pauseTrack = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
  };

  const resumeTrack = () => {
    if (audioRef.current) {
      audioRef.current.play().catch((err) => log.warn({ err }, "playback.resume.failed"));
    }
  };

  const togglePlayPause = () => {
    if (state.isPlaying) {
      pauseTrack();
    } else if (state.currentTrack) {
      resumeTrack();
    }
  };

  const seekTo = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setState((prev) => ({ ...prev, currentTime: time }));
    }
  };

  const setVolume = (volume: number) => {
    setState((prev) => ({ ...prev, volume }));
  };

  const contextValue: MusicPlayerContextType = {
    ...state,
    playTrack,
    pauseTrack,
    resumeTrack,
    seekTo,
    setVolume,
    togglePlayPause,
  };

  return <MusicPlayerContext.Provider value={contextValue}>{children}</MusicPlayerContext.Provider>;
}

"use client";

import React from "react";
import Link from "next/link";
import { Loader2, Pause, Play } from "lucide-react";
import { ApiTrack } from "@/lib/types";
import { useMusicPlayer } from "@/lib/contexts/music-player-context";

interface TrackListProps {
  tracks: ApiTrack[];
  showHeader?: boolean;
}

function formatDurationMs(seconds: number): string {
  return `${Math.round(seconds * 1000).toLocaleString()} ms`;
}

export function TrackList({ tracks, showHeader = true }: TrackListProps) {
  const { currentTrack, isPlaying, isLoading, playTrack, togglePlayPause } = useMusicPlayer();

  const handlePlay = (track: ApiTrack) => {
    if (currentTrack?.id === track.id) {
      togglePlayPause();
    } else {
      playTrack(track);
    }
  };

  return (
    <div>
      {showHeader && (
        <div className="kb-track-header">
          <div className="kb-th-num">#</div>
          <div />
          <div className="kb-th-col">Name</div>
          <div className="kb-th-col">Duration (ms)</div>
          <div />
        </div>
      )}
      {tracks.map((track, index) => {
        const isCurrent = currentTrack?.id === track.id;
        const isCurrentLoading = isCurrent && isLoading;
        const isCurrentPlaying = isCurrent && isPlaying;

        return (
          <div
            key={track.id}
            className={`kb-track-row${isCurrent ? " kb-track-current" : ""}`}
            onDoubleClick={() => handlePlay(track)}
          >
            <div className="kb-tr-num">{index + 1}</div>
            <div className="kb-tr-art" />
            <div className="kb-tr-info">
              <div className={`kb-tr-name${isCurrent ? " kb-tr-current-name" : ""}`}>{track.name}</div>
              <div className="kb-tr-sub">
                Track ·{" "}
                <Link
                  href={`/user/${track.user_id}`}
                  className="kb-tr-uploader"
                  onClick={(e) => e.stopPropagation()}
                >
                  {track.user_display_name ?? `User #${track.user_id}`}
                </Link>
              </div>
            </div>
            <div className="kb-tr-dur">{formatDurationMs(track.duration)}</div>
            <div className="kb-tr-rel">
              {typeof track.relevance === "number" ? track.relevance.toFixed(2) : ""}
            </div>
            <button
              type="button"
              className="kb-tr-play"
              style={isCurrent ? { opacity: 1 } : undefined}
              onClick={(e) => {
                e.stopPropagation();
                handlePlay(track);
              }}
              title={isCurrentPlaying ? "Pause" : "Play"}
            >
              {isCurrentLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : isCurrentPlaying ? (
                <Pause className="h-3 w-3" />
              ) : (
                <Play className="h-3 w-3" />
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}

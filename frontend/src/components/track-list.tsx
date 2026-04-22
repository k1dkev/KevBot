"use client";

import React from "react";
import Link from "next/link";
import { Loader2, Pause, Play } from "lucide-react";
import { ApiTrack } from "@/lib/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMusicPlayer } from "@/lib/contexts/music-player-context";

interface TrackListProps {
  tracks: ApiTrack[];
}

function formatDurationMs(seconds: number): string {
  return `${Math.round(seconds * 1000).toLocaleString()} ms`;
}

export function TrackList({ tracks }: TrackListProps) {
  const { currentTrack, isPlaying, isLoading, playTrack, togglePlayPause } = useMusicPlayer();

  const handlePlay = (track: ApiTrack) => {
    if (currentTrack?.id === track.id) {
      togglePlayPause();
    } else {
      playTrack(track);
    }
  };

  return (
    <div className="kb-table">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="kb-cell-num">#</TableHead>
            <TableHead className="kb-cell-art" />
            <TableHead>Name</TableHead>
            <TableHead className="kb-cell-meta">Duration (ms)</TableHead>
            <TableHead className="kb-cell-action" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {tracks.map((track, index) => {
            const isCurrent = currentTrack?.id === track.id;
            const isCurrentLoading = isCurrent && isLoading;
            const isCurrentPlaying = isCurrent && isPlaying;

            return (
              <TableRow
                key={track.id}
                className={isCurrent ? "kb-row-current" : undefined}
                onDoubleClick={() => handlePlay(track)}
              >
                <TableCell className="kb-cell-num">{index + 1}</TableCell>
                <TableCell className="kb-cell-art">
                  <div className="kb-cell-art-inner" />
                </TableCell>
                <TableCell>
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
                </TableCell>
                <TableCell className="kb-cell-meta">{formatDurationMs(track.duration)}</TableCell>
                <TableCell className="kb-cell-action">
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
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

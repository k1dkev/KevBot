"use client";

import { MouseEvent as ReactMouseEvent, useState } from "react";
import { Loader2 } from "lucide-react";
import { useMusicPlayer } from "@/lib/contexts/music-player-context";

function fmtTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function PlayBar() {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    isLoading,
    togglePlayPause,
    seekTo,
    setVolume,
  } = useMusicPlayer();
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleSeek = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekTo(ratio * duration);
  };

  const playDisabled = !currentTrack || isLoading;

  return (
    <div className="kb-player">
      <div className="kb-player-track-info">
        <div className="kb-player-art">{currentTrack ? "♪" : ""}</div>
        <div className="kb-player-meta">
          <div className="kb-player-name">
            {currentTrack?.name ?? <span className="kb-muted">—</span>}
          </div>
          <div className="kb-player-sub">
            {currentTrack?.user_display_name ?? ""}
          </div>
        </div>
      </div>

      <div className="kb-player-center">
        <div className="kb-player-btns">
          <button
            type="button"
            className={`kb-ctrl-btn${shuffle ? " kb-ctrl-active" : ""}`}
            onClick={() => setShuffle((s) => !s)}
            title="Shuffle"
            aria-label="Shuffle"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
            </svg>
          </button>
          <button type="button" className="kb-ctrl-btn" disabled title="Previous" aria-label="Previous">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
            </svg>
          </button>
          <button
            type="button"
            className="kb-play-btn"
            onClick={togglePlayPause}
            disabled={playDisabled}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : isPlaying ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 19h4V5H6zm8-14v14h4V5z" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <button type="button" className="kb-ctrl-btn" disabled title="Next" aria-label="Next">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6z" />
            </svg>
          </button>
          <button
            type="button"
            className={`kb-ctrl-btn${repeat ? " kb-ctrl-active" : ""}`}
            onClick={() => setRepeat((r) => !r)}
            title="Repeat"
            aria-label="Repeat"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 1l4 4-4 4" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
          </button>
        </div>
        <div className="kb-player-progress">
          <span className="kb-time-label">{fmtTime(currentTime)}</span>
          <div className="kb-scrubber" onClick={handleSeek}>
            <div className="kb-scrubber-fill" style={{ width: `${pct}%` }} />
            <div className="kb-scrubber-thumb" style={{ left: `${pct}%` }} />
          </div>
          <span className="kb-time-label">{fmtTime(duration)}</span>
        </div>
      </div>

      <div className="kb-player-right">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.5 }}>
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
        </svg>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          onChange={(e) => setVolume(Number(e.target.value) / 100)}
          className="kb-volume-slider"
          aria-label="Volume"
        />
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.5 }}>
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
        </svg>
      </div>
    </div>
  );
}

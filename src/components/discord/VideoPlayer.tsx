"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Maximize2, Minimize2, Pause, Play, RotateCcw, Volume1, Volume2, VolumeX } from "lucide-react";
import { useContextMenu } from "@/components/ui/ContextMenu";
import { formatFileSize } from "@/lib/messages";
import { saveMedia } from "@/lib/media-actions";
import { safeWindowOpen } from "@/lib/safe-url";
import {
  PLAYBACK_RATES,
  SeekBar,
  bufferedFraction,
  claimPlayback,
  formatTime,
  useMediaClock,
} from "./media/MediaKit";

interface VideoPlayerProps {
  src: string;
  className?: string;
  onLoad?: () => void;
  fileName?: string;
  size?: number | null;
}

/*
 Inline video, styled like the classic desktop client rather than a modern
 media app: a flat file card with the blue name and size above the frame, a
 square play control and a solid control strip instead of floating pills.

 Keys when the player is focused: Space/K play-pause, ←/→ seek 5s (Shift for
 10s), ↑/↓ volume, M mute, F fullscreen. Double-click toggles fullscreen.
*/
export function VideoPlayer({ src, className = "", onLoad, fileName = "video", size }: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [started, setStarted] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { openMenu } = useContextMenu();
  useMediaClock(video);

  const current = video?.currentTime ?? 0;
  const duration = video && Number.isFinite(video.duration) ? video.duration : 0;
  const playing = !!video && !video.paused && !video.ended;
  const ended = !!video?.ended;
  const muted = !!video?.muted || video?.volume === 0;
  const volume = video?.volume ?? 1;
  const rate = video?.playbackRate ?? 1;
  const sizeLabel = formatFileSize(size);

  const revealControls = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (video && !video.paused) setShowControls(false);
    }, 2200);
  }, [video]);

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  const togglePlay = useCallback(() => {
    if (!video) return;
    if (video.paused || video.ended) {
      claimPlayback(video);
      setStarted(true);
      void video.play();
    } else {
      video.pause();
    }
  }, [video]);

  const seek = (s: number) => {
    if (video) video.currentTime = Math.min(duration, Math.max(0, s));
  };
  const setVolume = (v: number) => {
    if (!video) return;
    video.volume = Math.min(1, Math.max(0, v));
    video.muted = video.volume === 0;
  };
  const toggleMute = () => {
    if (!video) return;
    if (video.muted || video.volume === 0) {
      video.muted = false;
      if (video.volume === 0) video.volume = 0.6;
    } else {
      video.muted = true;
    }
  };
  const cycleRate = () => {
    if (!video) return;
    const i = PLAYBACK_RATES.indexOf(rate as (typeof PLAYBACK_RATES)[number]);
    video.playbackRate = PLAYBACK_RATES[(i + 1) % PLAYBACK_RATES.length];
  };

  /**
   * Real fullscreen, not a full-viewport div: the Fullscreen API takes over
   * the display properly, and on the desktop build fills the window. Safari
   * and the WebKit desktop build only have the prefixed form; if the request
   * is refused, fall back to an in-page expansion rather than doing nothing.
   */
  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void>;
    };
    const target = el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
    const active = document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
    if (active || fullscreen) {
      if (active) void (document.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
      else setFullscreen(false);
      return;
    }
    const request = target.requestFullscreen?.bind(target) ?? target.webkitRequestFullscreen?.bind(target);
    if (!request) {
      setFullscreen(true);
      return;
    }
    void request().catch(() => setFullscreen(true));
  }, [fullscreen]);

  // Escape and F11 change fullscreen without the button, so mirror the browser.
  useEffect(() => {
    const sync = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element | null };
      const active = document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
      setFullscreen(!!active && active === containerRef.current);
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!video || (e.target as HTMLElement).getAttribute("role") === "slider") return;
    const k = e.key.toLowerCase();
    if (k === " " || k === "k") togglePlay();
    else if (k === "arrowright") seek(current + (e.shiftKey ? 10 : 5));
    else if (k === "arrowleft") seek(current - (e.shiftKey ? 10 : 5));
    else if (k === "arrowup") setVolume(volume + 0.1);
    else if (k === "arrowdown") setVolume(volume - 0.1);
    else if (k === "m") toggleMute();
    else if (k === "f") toggleFullscreen();
    else return;
    e.preventDefault();
    revealControls();
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    openMenu(e.clientX, e.clientY, [
      { id: "play", label: playing ? "Pause" : "Play", onClick: togglePlay },
      { id: "save", label: "Save video", onClick: () => void saveMedia(src, fileName) },
      { id: "copy-link", label: "Copy link", onClick: () => void navigator.clipboard.writeText(src) },
      { id: "open", label: "Open original", onClick: () => safeWindowOpen(src) },
    ]);
  };

  const controlsVisible = showControls || !playing;
  const iconBtn =
    "flex h-7 w-7 items-center justify-center rounded-[2px] text-white/85 transition-colors hover:bg-white/10 hover:text-white";
  const VolumeIcon = muted ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      aria-label="Video player"
      onKeyDown={onKeyDown}
      onContextMenu={onContextMenu}
      className={`group/video outline-none focus-visible:ring-1 focus-visible:ring-brand ${
        fullscreen
          ? "fixed inset-0 z-[200] flex flex-col bg-black"
          : "relative w-full max-w-[520px] overflow-hidden rounded-[4px] border border-divider bg-bg-secondary"
      } ${playing && !showControls ? "cursor-none" : ""} ${className}`}
      onMouseMove={revealControls}
      onMouseLeave={() => !fullscreen && playing && setShowControls(false)}
    >
      {!fullscreen && (
        <div className="flex items-center gap-2 border-b border-divider bg-bg-secondary px-3 py-2">
          <VideoGlyph />
          <p className="min-w-0 flex-1 truncate text-[15px] font-medium leading-5 text-text-link" title={fileName}>
            {fileName}
          </p>
          {sizeLabel && <span className="shrink-0 text-[12px] text-text-muted">{sizeLabel}</span>}
        </div>
      )}

      <div className={fullscreen ? "relative flex min-h-0 flex-1 bg-black" : "relative bg-black"}>
        <video
          ref={setVideo}
          src={src}
          preload="metadata"
          playsInline
          className={`block w-full object-contain ${fullscreen ? "h-full" : "max-h-[min(24rem,40vh)] min-h-[160px]"}`}
          onClick={togglePlay}
          onDoubleClick={toggleFullscreen}
          onPlay={() => revealControls()}
          onPause={() => setShowControls(true)}
          onWaiting={() => setWaiting(true)}
          onPlaying={() => setWaiting(false)}
          onCanPlay={() => setWaiting(false)}
          onLoadedMetadata={() => onLoad?.()}
        />

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void saveMedia(src, fileName);
          }}
          aria-label="Download video"
          title="Download"
          className="absolute right-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-[2px] border border-white/15 bg-[#202225]/90 text-white/85 opacity-0 transition-opacity hover:bg-[#202225] hover:text-white focus-visible:opacity-100 group-hover/video:opacity-100"
        >
          <Download size={15} />
        </button>

        {/* Classic square play control, not a modern circular button. */}
        {!playing && !waiting && (
          <button
            type="button"
            onClick={togglePlay}
            aria-label={ended ? "Replay" : "Play"}
            className="absolute left-1/2 top-1/2 flex h-12 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[2px] border border-white/25 bg-black/65 text-white transition-colors hover:bg-black/80"
          >
            {ended ? <RotateCcw size={21} strokeWidth={2.2} /> : <Play size={21} fill="currentColor" strokeWidth={0} className="translate-x-[1px]" />}
          </button>
        )}
        {waiting && playing && (
          <span
            aria-label="Loading"
            className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 animate-spin rounded-full border-[3px] border-white/25 border-t-white"
          />
        )}

        {/* Before first play, show the length in a flat black tag. */}
        {!started && duration > 0 && (
          <span className="pointer-events-none absolute bottom-2 right-2 rounded-[2px] bg-black/75 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
            {formatTime(duration)}
          </span>
        )}

        {started && (
          <div
            className={`absolute inset-x-0 bottom-0 border-t border-white/10 bg-[#202225]/95 px-2 py-1.5 transition-opacity duration-150 ${
              controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            <SeekBar current={current} duration={duration} buffered={bufferedFraction(video)} onSeek={seek} />
            <div className="mt-0.5 flex items-center gap-0.5 text-white">
              <button type="button" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"} className={iconBtn}>
                {playing ? <Pause size={16} fill="currentColor" strokeWidth={0} /> : <Play size={16} fill="currentColor" strokeWidth={0} />}
              </button>
              <button type="button" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"} className={iconBtn}>
                <VolumeIcon size={16} />
              </button>

              <span className="ml-1 text-[11px] tabular-nums text-white/80">
                {formatTime(current)} <span className="text-white/40">/ {formatTime(duration)}</span>
              </span>

              <div className="flex-1" />

              <button
                type="button"
                onClick={cycleRate}
                title="Playback speed"
                className="h-7 min-w-[36px] rounded-[2px] px-1 text-[11px] font-medium tabular-nums text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                {rate}×
              </button>
              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
                className={iconBtn}
              >
                {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Flat blue video-file glyph for the classic file strip. */
function VideoGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="shrink-0 text-text-link">
      <rect x="2.5" y="4.5" width="19" height="15" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 8.5v7l5.5-3.5Z" fill="currentColor" />
    </svg>
  );
}

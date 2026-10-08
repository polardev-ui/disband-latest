"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, Pause, Play, RotateCcw, Volume1, Volume2, VolumeX } from "lucide-react";
import { useContextMenu } from "@/components/ui/ContextMenu";
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
}

/*
 Inline video.

 Before playback it shows a single solid play button and the length; while
 playing, a slim control bar appears on movement and gets out of the way when
 you stop moving. No browser chrome, no glow — the same matte controls as the
 audio player, so media looks like one family.

 Keys when the player is focused: Space/K play-pause, ←/→ seek 5s (Shift for
 10s), ↑/↓ volume, M mute, F fullscreen. Double-click toggles fullscreen.
*/
export function VideoPlayer({ src, className = "", onLoad, fileName = "video" }: VideoPlayerProps) {
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
    "flex h-8 w-8 items-center justify-center rounded-lg text-white/85 transition-colors hover:bg-white/10 hover:text-white";
  const VolumeIcon = muted ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      aria-label="Video player"
      onKeyDown={onKeyDown}
      onContextMenu={onContextMenu}
      className={`group/video relative overflow-hidden bg-black outline-none focus-visible:ring-1 focus-visible:ring-brand ${
        fullscreen ? "fixed inset-0 z-[200]" : "rounded-[14px] border border-divider"
      } ${playing && !showControls ? "cursor-none" : ""} ${className}`}
      onMouseMove={revealControls}
      onMouseLeave={() => !fullscreen && playing && setShowControls(false)}
    >
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

      {/* Centre state: big play before/while paused, replay at the end. */}
      {!playing && !waiting && (
        <button
          type="button"
          onClick={togglePlay}
          aria-label={ended ? "Replay" : "Play"}
          className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black transition-transform duration-150 hover:scale-105 active:scale-95"
        >
          {ended ? <RotateCcw size={22} strokeWidth={2.4} /> : <Play size={22} fill="currentColor" strokeWidth={0} className="translate-x-[2px]" />}
        </button>
      )}
      {waiting && playing && (
        <span
          aria-label="Loading"
          className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 animate-spin rounded-full border-[3px] border-white/25 border-t-white"
        />
      )}

      {/* Before first play, just the length — the control bar comes later. */}
      {!started && duration > 0 && (
        <span className="pointer-events-none absolute bottom-2.5 right-2.5 rounded-md bg-black/75 px-1.5 py-0.5 text-[11.5px] font-medium tabular-nums text-white">
          {formatTime(duration)}
        </span>
      )}

      {started && (
        <div
          className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/40 to-transparent px-3 pb-2 pt-10 transition-opacity duration-200 ${
            controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <SeekBar current={current} duration={duration} buffered={bufferedFraction(video)} onSeek={seek} />
          <div className="mt-1 flex items-center gap-1 text-white">
            <button type="button" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"} className={iconBtn}>
              {playing ? <Pause size={17} fill="currentColor" strokeWidth={0} /> : <Play size={17} fill="currentColor" strokeWidth={0} />}
            </button>

            <div className="group/vol flex items-center">
              <button type="button" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"} className={iconBtn}>
                <VolumeIcon size={17} />
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                aria-label="Volume"
                className="h-1 w-0 cursor-pointer appearance-none rounded-full bg-white/30 accent-white opacity-0 transition-[width,opacity,margin] duration-150 group-hover/vol:mr-2 group-hover/vol:w-16 group-hover/vol:opacity-100 focus:mr-2 focus:w-16 focus:opacity-100"
              />
            </div>

            <span className="ml-1 text-[12px] tabular-nums text-white/85">
              {formatTime(current)} <span className="text-white/45">/ {formatTime(duration)}</span>
            </span>

            <div className="flex-1" />

            <button
              type="button"
              onClick={cycleRate}
              title="Playback speed"
              className="h-8 min-w-[40px] rounded-lg px-1.5 text-[12px] font-medium tabular-nums text-white/85 transition-colors hover:bg-white/10 hover:text-white"
            >
              {rate}×
            </button>
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
              className={iconBtn}
            >
              {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

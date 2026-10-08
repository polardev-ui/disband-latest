"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

/** Shared pieces of the audio and video players, so both behave as one family. */

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ss = s.toString().padStart(2, "0");
  return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export const PLAYBACK_RATES = [1, 1.25, 1.5, 2] as const;

// One thing plays at a time: starting a clip pauses whatever was playing.
let playing: HTMLMediaElement | null = null;
export function claimPlayback(el: HTMLMediaElement) {
  if (playing && playing !== el && !playing.paused) playing.pause();
  playing = el;
}

/** Latest buffered end, as a fraction of the duration. */
export function bufferedFraction(el: HTMLMediaElement | null): number {
  if (!el || !el.duration || !Number.isFinite(el.duration) || el.buffered.length === 0) return 0;
  return Math.min(1, el.buffered.end(el.buffered.length - 1) / el.duration);
}

/**
 * Pointer scrubbing over a horizontal track: press, drag and release, with
 * the pointer captured so dragging off the track keeps working.
 */
export function useScrub(onSeek: (fraction: number) => void) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState<number | null>(null);

  const fractionAt = useCallback((clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return 0;
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  }, []);

  const handlers = {
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
      onSeek(fractionAt(e.clientX));
    },
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
      const f = fractionAt(e.clientX);
      setHover(f);
      if (dragging) onSeek(f);
    },
    onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => {
      e.currentTarget.releasePointerCapture(e.pointerId);
      setDragging(false);
    },
    onPointerLeave: () => {
      if (!dragging) setHover(null);
    },
  };

  return { trackRef, handlers, dragging, hover };
}

/** Keyboard seeking/volume for a focused slider, per the WAI-ARIA slider pattern. */
export function sliderKeys(
  e: React.KeyboardEvent,
  current: number,
  duration: number,
  seekTo: (seconds: number) => void,
) {
  const step = e.shiftKey ? 10 : 5;
  if (e.key === "ArrowRight" || e.key === "ArrowUp") seekTo(Math.min(duration, current + step));
  else if (e.key === "ArrowLeft" || e.key === "ArrowDown") seekTo(Math.max(0, current - step));
  else if (e.key === "Home") seekTo(0);
  else if (e.key === "End") seekTo(duration);
  else return;
  e.preventDefault();
  e.stopPropagation();
}

/**
 * Thin seek track: thickens on hover, shows the buffered range and a time
 * preview under the pointer, and supports dragging.
 */
export function SeekBar({
  current,
  duration,
  buffered,
  onSeek,
  tone = "dark",
}: {
  current: number;
  duration: number;
  buffered: number;
  onSeek: (seconds: number) => void;
  /** "dark" sits on video; "surface" sits on an app card. */
  tone?: "dark" | "surface";
}) {
  const { trackRef, handlers, dragging, hover } = useScrub((f) => duration && onSeek(f * duration));
  const played = duration ? Math.min(1, current / duration) : 0;
  const rail = tone === "dark" ? "bg-white/25" : "bg-text-muted/25";
  const buf = tone === "dark" ? "bg-white/35" : "bg-text-muted/35";
  const fill = tone === "dark" ? "bg-white" : "bg-text-normal";

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(current)}
      aria-valuetext={`${formatTime(current)} of ${formatTime(duration)}`}
      onKeyDown={(e) => sliderKeys(e, current, duration, onSeek)}
      {...handlers}
      className="group/seek relative flex h-4 cursor-pointer touch-none items-center outline-none"
    >
      <div className={`relative h-[3px] w-full overflow-hidden rounded-full transition-[height] duration-100 group-hover/seek:h-[5px] group-focus-visible/seek:h-[5px] ${dragging ? "h-[5px]" : ""} ${rail}`}>
        <div className={`absolute inset-y-0 left-0 ${buf}`} style={{ width: `${buffered * 100}%` }} />
        <div className={`absolute inset-y-0 left-0 ${fill}`} style={{ width: `${played * 100}%` }} />
      </div>
      <span
        aria-hidden
        className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform duration-100 ${fill} ${
          dragging ? "scale-100" : "scale-0 group-hover/seek:scale-100 group-focus-visible/seek:scale-100"
        }`}
        style={{ left: `${played * 100}%` }}
      />
      {hover !== null && duration > 0 && (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-full mb-1.5 -translate-x-1/2 rounded-md bg-black/85 px-1.5 py-0.5 text-[11px] tabular-nums text-white"
          style={{ left: `${hover * 100}%` }}
        >
          {formatTime(hover * duration)}
        </span>
      )}
    </div>
  );
}

/** Re-renders while a media element plays, so time readouts stay current. */
export function useMediaClock(el: HTMLMediaElement | null) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!el) return;
    const bump = () => tick((n) => n + 1);
    const events = ["timeupdate", "progress", "durationchange", "loadedmetadata", "play", "pause", "ended", "volumechange", "ratechange", "waiting", "playing"];
    for (const ev of events) el.addEventListener(ev, bump);
    return () => {
      for (const ev of events) el.removeEventListener(ev, bump);
    };
  }, [el]);
}

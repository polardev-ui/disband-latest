"use client";

import { Children, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import type { Profile } from "@/lib/supabase/types";

/**
 * One tile in a call.
 *
 * Everything in a call is the same shape — a rounded rectangle — because a
 * screen share is not round. Circles worked while a call was only faces, but
 * cropping a shared screen into one made it unreadable, and mixing a circle
 * with a rectangle made the share look like a different kind of object rather
 * than another participant.
 *
 * The avatar stays circular *inside* the tile, and a live camera or screen
 * replaces it in place rather than appearing somewhere else.
 */
export function CallTile({
  profile, label, stream, kind = "camera", speaking = false, muted = false,
  self = false, onClick,
}: {
  profile?: Profile | { display_name?: string | null; avatar_url?: string | null } | null;
  label: string;
  /** A camera or screen track. Absent means show the avatar. */
  stream?: MediaStream | null;
  kind?: "camera" | "screen";
  speaking?: boolean;
  muted?: boolean;
  self?: boolean;
  onClick?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !stream) return;
    el.srcObject = stream;
    void el.play().catch(() => {});
  }, [stream]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative h-full min-h-0 w-full overflow-hidden rounded-xl bg-bg-tertiary transition-shadow ${
        speaking ? "ring-2 ring-status-online" : "ring-1 ring-white/5"
      } ${onClick ? "cursor-pointer" : "cursor-default"}`}
    >
      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          // Your own camera is mirrored, the way every other app shows it; a
          // shared screen never is, or text in it comes out backwards.
          muted={self || kind === "screen"}
          className={`h-full w-full ${
            kind === "screen" ? "object-contain bg-black" : "object-cover"
          } ${self && kind === "camera" ? "-scale-x-100" : ""}`}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center">
          <Avatar
            profile={profile ?? { display_name: label }}
            size="lg"
            className="h-20 w-20 text-2xl"
          />
        </span>
      )}

      <span className="pointer-events-none absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-[13px] font-medium text-white backdrop-blur-sm">
        {muted && (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.2" strokeLinecap="round" className="shrink-0 text-status-dnd">
            <path d="m2 2 20 20" />
            <path d="M9 9v3a3 3 0 0 0 5.1 2.1M15 9.3V6a3 3 0 0 0-5.9-.7" />
            <path d="M17 16.9A7 7 0 0 1 5 12v-2M12 19v3" />
          </svg>
        )}
        <span className="truncate">{label}</span>
        {kind === "screen" && (
          <span className="shrink-0 rounded bg-status-online/25 px-1 text-[10px] font-bold uppercase tracking-wide text-status-online">
            Live
          </span>
        )}
      </span>
    </button>
  );
}

/**
 * The area a call lays its tiles out in.
 *
 * Tiles keep a 16:9 shape at whatever size fits. A plain CSS grid stretches
 * every cell to fill the row, so making the call region shorter squashed the
 * tiles into letterbox slabs and a face was cropped to a strip. Here the
 * layout is measured instead: every column count is tried, and the one that
 * makes the largest tile that still fits — width *and* height — wins. That is
 * why two people get two big tiles side by side while nine get a 3x3, without
 * any breakpoint deciding it in advance.
 */
const TILE_ASPECT = 16 / 9;
const TILE_GAP = 12;
/** Below this a tile is unreadable; the area scrolls rather than shrink further. */
const MIN_TILE_WIDTH = 128;

/**
 * A pixel of slack in each direction.
 *
 * A row that comes to exactly the available width is a coin flip: sub-pixel
 * layout rounds it either way, and losing the flip wraps the last tile onto a
 * line of its own. Giving up one pixel costs nothing visible and makes the
 * arithmetic decide the layout rather than the rounding.
 */
const FIT_SLACK = 1;

export function bestTileSize(
  count: number,
  width: number,
  height: number,
): { width: number; height: number } {
  if (count <= 0 || width <= 0 || height <= 0) return { width: 0, height: 0 };

  const availableW = width - FIT_SLACK;
  const availableH = height - FIT_SLACK;

  let best = 0;
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const cellW = (availableW - TILE_GAP * (cols - 1)) / cols;
    const cellH = (availableH - TILE_GAP * (rows - 1)) / rows;
    if (cellW <= 0 || cellH <= 0) continue;
    // Whichever of the two constrains the tile is the one that sets its size.
    best = Math.max(best, Math.min(cellW, cellH * TILE_ASPECT));
  }

  const w = Math.floor(Math.max(best, MIN_TILE_WIDTH));
  return { width: w, height: Math.floor(w / TILE_ASPECT) };
}

export function CallGrid({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });

  /**
   * The call region is resizable, so tile size is derived from the box itself
   * rather than from the window or a breakpoint.
   *
   * Measured directly as well as observed. A ResizeObserver reports nothing
   * until its first callback — and does not run at all while the page is not
   * being rendered — so relying on it alone left the tiles with no size, which
   * collapses them to the width of the avatar inside. Measuring in a layout
   * effect also means the first paint is already correct instead of popping
   * into place a frame later.
   */
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      // clientWidth/Height, not the bounding rect: when the tiles do overflow
      // and this box gains a scrollbar, the rect still counts the scrollbar's
      // width as usable and the last tile of each row wraps away.
      const width = el.clientWidth;
      const height = el.clientHeight;
      setBox((prev) =>
        Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1
          ? prev
          : { width, height },
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    // A window resize that does not change this element's own box still can
    // change it a moment later, once the surrounding layout settles.
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  });

  // toArray drops the nulls a conditional tile leaves behind, so an absent
  // camera or share is not counted as a tile and given an empty box.
  const tiles = Children.toArray(children);
  const tile = bestTileSize(tiles.length, box.width, box.height);

  return (
    <div
      ref={ref}
      className="flex min-h-0 w-full flex-1 flex-wrap content-center items-center justify-center gap-3 overflow-y-auto"
    >
      {tiles.map((child, i) => (
        <div
          key={i}
          style={{ width: tile.width || undefined, height: tile.height || undefined }}
        >
          {child}
        </div>
      ))}
    </div>
  );
}

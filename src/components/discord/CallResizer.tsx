"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A call region you can drag taller or shorter.
 *
 * The call took a fixed slice of the window, so on a short screen it crowded
 * the conversation out and on a tall one it wasted space. Dragging the bottom
 * edge sets the height, and the choice is remembered — a call is not a
 * one-size thing, and the right size depends on whether you are watching a
 * shared screen or just listening.
 */

const KEY = "disband:call-height";
const MIN = 180;
/** Leave room for the composer and a few messages, whatever the window height. */
const MAX_FRACTION = 0.8;

function stored(): number | null {
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isFinite(v) && v >= MIN ? v : null;
  } catch {
    return null;
  }
}

export function useCallHeight(defaultHeight = 360) {
  const [height, setHeight] = useState<number>(() => stored() ?? defaultHeight);

  const clamp = useCallback((h: number) => {
    const max = Math.max(MIN, Math.round(window.innerHeight * MAX_FRACTION));
    return Math.min(max, Math.max(MIN, Math.round(h)));
  }, []);

  // A window that shrinks below the stored height would otherwise leave no
  // room for the conversation at all.
  useEffect(() => {
    const onResize = () => setHeight((h) => clamp(h));
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, [clamp]);

  const commit = useCallback((h: number) => {
    const next = clamp(h);
    setHeight(next);
    try {
      localStorage.setItem(KEY, String(next));
    } catch {
      // Private browsing: the size holds for this session.
    }
  }, [clamp]);

  return { height, setHeight: commit, clamp };
}

export function CallResizeHandle({
  height, onResize,
}: {
  height: number;
  onResize: (next: number) => void;
}) {
  const startRef = useRef<{ y: number; h: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    startRef.current = { y: e.clientY, h: height };
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = startRef.current;
    if (!start) return;
    onResize(start.h + (e.clientY - start.y));
  };

  const end = () => {
    startRef.current = null;
    setDragging(false);
  };

  return (
    <div
      role="separator"
      aria-label="Resize call"
      aria-orientation="horizontal"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      // Keyboard resizing, since a drag handle is unreachable without a mouse.
      onKeyDown={(e) => {
        if (e.key === "ArrowUp") { e.preventDefault(); onResize(height - 24); }
        if (e.key === "ArrowDown") { e.preventDefault(); onResize(height + 24); }
      }}
      className="group relative h-2 w-full shrink-0 cursor-row-resize touch-none bg-black"
    >
      <div
        className={`absolute left-1/2 top-1/2 h-1 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors ${
          dragging ? "bg-brand" : "bg-white/15 group-hover:bg-white/35"
        }`}
      />
    </div>
  );
}

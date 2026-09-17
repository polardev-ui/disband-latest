"use client";

import { Children, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import type { Profile } from "@/lib/supabase/types";

export function CallTile({
  profile, label, stream, kind = "camera", speaking = false, muted = false,
  self = false, onClick,
}: {
  profile?: Profile | { display_name?: string | null; avatar_url?: string | null } | null;
  label: string;

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

const TILE_ASPECT = 16 / 9;
const TILE_GAP = 12;

const MIN_TILE_WIDTH = 128;

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

    best = Math.max(best, Math.min(cellW, cellH * TILE_ASPECT));
  }

  const w = Math.floor(Math.max(best, MIN_TILE_WIDTH));
  return { width: w, height: Math.floor(w / TILE_ASPECT) };
}

export function CallGrid({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {

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

    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  });

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

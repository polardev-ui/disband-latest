"use client";

import { useEffect, useState } from "react";
import { safeImageUrl } from "@/lib/safe-url";
import { ImageLightbox } from "./ImageLightbox";
import type { Profile } from "@/lib/supabase/types";

export interface MessageAttachment {
  url: string;
  type?: string | null;
  name?: string | null;
  size?: number | null;
}

/**
 * How many images go on each row, by total count — the mosaic Discord uses.
 *
 * The shape is deliberate rather than a flat grid: a lone leading row of one
 * or two gives the set a "hero", and rows of three keep later images from
 * shrinking to thumbnails. Anything past ten cannot be sent, but is laid out
 * in threes rather than dropped.
 */
function rowsFor(count: number): number[] {
  switch (count) {
    case 1: return [1];
    case 2: return [2];
    // 3 is the one count that is not row-based: a hero on the left with two
    // stacked beside it. Handled separately below.
    case 3: return [3];
    case 4: return [2, 2];
    case 5: return [2, 3];
    case 6: return [3, 3];
    case 7: return [1, 3, 3];
    case 8: return [2, 3, 3];
    case 9: return [3, 3, 3];
    case 10: return [1, 3, 3, 3];
    default: {
      const rows: number[] = [];
      for (let left = count; left > 0; left -= 3) rows.push(Math.min(3, left));
      return rows;
    }
  }
}

/** A row of one is the hero and gets more height than a row of three. */
const ROW_HEIGHT: Record<number, string> = {
  1: "clamp(160px, 42vh, 300px)",
  2: "clamp(120px, 26vh, 190px)",
  3: "clamp(90px, 18vh, 140px)",
};

export function AttachmentGrid({
  attachments,
  author,
  authorColor,
  isOwn,
  createdAt,
}: {
  attachments: MessageAttachment[];
  author?: Profile;
  authorColor?: string | null;
  isOwn?: boolean;
  createdAt?: string;
}) {
  const images = attachments.filter((a) => isImage(a));
  const others = attachments.filter((a) => !isImage(a));
  // Which image the lightbox is showing; null when closed. Held here rather
  // than per tile so the arrows can move between them.
  const [openAt, setOpenAt] = useState<number | null>(null);
  const onOpen = (_a: MessageAttachment, index: number) => setOpenAt(index);

  // Left/right walk the set while the lightbox is open. Escape is the
  // lightbox's own; this only adds what a gallery needs.
  useEffect(() => {
    if (openAt === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      setOpenAt((i) => {
        if (i === null) return i;
        const next = e.key === "ArrowRight" ? i + 1 : i - 1;
        // Stop at the ends rather than wrapping, so holding a key does not
        // spin through the set forever.
        return Math.min(images.length - 1, Math.max(0, next));
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openAt, images.length]);

  const current = openAt === null ? null : images[openAt] ?? null;
  const lightbox = current ? (
    <ImageLightbox
      open
      onClose={() => setOpenAt(null)}
      src={safeImageUrl(current.url) ?? ""}
      alt={current.name ?? ""}
      fileName={current.name ?? undefined}
      author={author}
      authorColor={authorColor}
      isOwn={isOwn}
      createdAt={createdAt}
    />
  ) : null;

  const tile = (a: MessageAttachment, index: number, className: string) => {
    const src = safeImageUrl(a.url);
    if (!src) return null;
    return (
      <button
        key={a.url + index}
        type="button"
        onClick={() => onOpen?.(a, index)}
        className={`min-w-0 overflow-hidden bg-bg-accent transition-opacity hover:opacity-90 ${className}`}
        aria-label={a.name ? `Open ${a.name}` : "Open image"}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={a.name ?? ""} loading="lazy" className="h-full w-full object-cover" />
      </button>
    );
  };

  // Three images get a hero beside a stacked pair rather than a row split,
  // which is what Discord does and what stops the third image looking orphaned.
  if (images.length === 3) {
    return (
      <div className="mt-1 max-w-[560px]">
        <div className="flex gap-1 overflow-hidden rounded-lg" style={{ height: ROW_HEIGHT[2] }}>
          {tile(images[0], 0, "flex-[2]")}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {tile(images[1], 1, "min-h-0 flex-1")}
            {tile(images[2], 2, "min-h-0 flex-1")}
          </div>
        </div>
        {others.length > 0 && <OtherFiles others={others} />}
        {lightbox}
      </div>
    );
  }

  let cursor = 0;
  const rows = rowsFor(images.length).map((n) => {
    const slice = images.slice(cursor, cursor + n);
    cursor += n;
    return slice;
  });

  return (
    <div className="mt-1 max-w-[560px]">
      {images.length > 0 && (
        <div className="flex flex-col gap-1 overflow-hidden rounded-lg">
          {rows.map((row, r) =>
            row.length === 0 ? null : (
              <div key={r} className="flex gap-1" style={{ height: ROW_HEIGHT[row.length] ?? ROW_HEIGHT[3] }}>
                {row.map((a, i) => {
                  const src = safeImageUrl(a.url);
                  if (!src) return null;
                  const index = rows.slice(0, r).reduce((n, x) => n + x.length, 0) + i;
                  return (
                    <button
                      key={a.url + i}
                      type="button"
                      onClick={() => onOpen?.(a, index)}
                      className="min-w-0 flex-1 overflow-hidden bg-bg-accent transition-opacity hover:opacity-90"
                      aria-label={a.name ? `Open ${a.name}` : "Open image"}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt={a.name ?? ""}
                        loading="lazy"
                        // Cover, so a row of mixed aspect ratios stays flush
                        // instead of leaving gaps between tiles.
                        className="h-full w-full object-cover"
                      />
                    </button>
                  );
                })}
              </div>
            ),
          )}
        </div>
      )}

      {others.length > 0 && <OtherFiles others={others} />}
      {lightbox}
    </div>
  );
}

function OtherFiles({ others }: { others: MessageAttachment[] }) {
  return (
    <>
      {others.map((a, i) => (
        <a
          key={a.url + i}
          href={safeImageUrl(a.url) ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 flex items-center gap-2 rounded-md bg-bg-accent px-3 py-2 text-sm text-text-normal hover:bg-interactive-hover"
        >
          <span className="truncate">{a.name ?? "Attachment"}</span>
          {a.size ? (
            <span className="ml-auto shrink-0 text-xs text-text-muted">{formatSize(a.size)}</span>
          ) : null}
        </a>
      ))}
    </>
  );
}

function isImage(a: MessageAttachment): boolean {
  if (a.type?.startsWith("image/")) return true;
  if (a.type === "image" || a.type === "gif") return true;
  return /\.(png|jpe?g|gif|webp|avif|bmp)(\?|$)/i.test(a.url);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

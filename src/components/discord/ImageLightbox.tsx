"use client";

import { useCallback, useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/ui/Avatar";
import { PlatformBadge } from "@/components/ui/PlatformBadge";
import { safeImageUrl, safeWindowOpen } from "@/lib/safe-url";
import {
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconDownload,
  IconExternalLink,
  IconZoomIn,
  IconZoomOut,
} from "@/components/icons";
import { formatMessageTime, displayName } from "@/lib/utils";
import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
import { useContextMenu } from "@/components/ui/ContextMenu";
import { OVERLAY_Z } from "@/lib/overlay";
import { copyImageToClipboard, saveMedia } from "@/lib/media-actions";
import { getUsernameStyle } from "@/lib/profileColor";
import type { Profile } from "@/lib/supabase/types";

const ZOOM_STEPS = [1, 1.5, 2, 3, 4];

/*
 The media viewer: a flat black stage with the picture floating on it.

 It used to be a framed card on a blurred backdrop, with the author header
 inside the card — the picture competed with its own frame, and the blur made
 the whole thing feel like a modal rather than a viewer. Now the chrome lives
 at the edges (who and when on the left, tools on the right, filename below)
 and the middle of the screen belongs to the image.
*/

interface ImageLightboxProps {
  open: boolean;
  onClose: () => void;
  src: string;
  alt?: string;
  fileName?: string;
  animated?: boolean;
  author?: Profile;
  authorColor?: string | null;
  isOwn?: boolean;
  createdAt?: string;
  /** Part of a set (a multi-image message): shows "2 / 5" and prev/next controls. */
  position?: { index: number; total: number };
  onPrev?: () => void;
  onNext?: () => void;
}

export function ImageLightbox({
  open,
  onClose,
  src,
  alt = "Attachment",
  fileName = "image",
  animated = false,
  author,
  authorColor,
  isOwn,
  createdAt,
  position,
  onPrev,
  onNext,
}: ImageLightboxProps) {
  const [zoomIndex, setZoomIndex] = useState(0);
  // Where on the image a click-zoom was aimed, as % of the image box.
  const [origin, setOrigin] = useState("50% 50%");
  const zoom = ZOOM_STEPS[zoomIndex];
  const { openMenu } = useContextMenu();
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  useOverlayDismiss(onClose, open);

  // A new picture always starts un-zoomed.
  useEffect(() => {
    setZoomIndex(0);
    setOrigin("50% 50%");
  }, [open, src]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "+" || e.key === "=") setZoomIndex((i) => Math.min(i + 1, ZOOM_STEPS.length - 1));
      if (e.key === "-") setZoomIndex((i) => Math.max(i - 1, 0));
      if (e.key === "0") setZoomIndex(0);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const zoomIn = useCallback(() => setZoomIndex((i) => Math.min(i + 1, ZOOM_STEPS.length - 1)), []);
  const zoomOut = useCallback(() => setZoomIndex((i) => Math.max(i - 1, 0)), []);

  // Click the picture to zoom into that spot; click again to come back out.
  const onImageClick = useCallback((e: MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    if (zoomIndex > 0) {
      setZoomIndex(0);
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    setOrigin(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`);
    setZoomIndex(2);
  }, [zoomIndex]);

  const run = (action: () => Promise<void>, done: string, failed: string) => {
    void action().then(
      () => setToast(done),
      () => setToast(failed),
    );
  };

  // The desktop webview has no native context menu, so the viewer brings its
  // own — the same on web and desktop.
  const onMediaContextMenu = (e: MouseEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const url = safeImageUrl(src);
    if (!url) return;
    openMenu(e.clientX, e.clientY, [
      ...(!animated
        ? [{ id: "copy-image", label: "Copy image", onClick: () => run(() => copyImageToClipboard(url), "Image copied", "Couldn't copy the image") }]
        : []),
      { id: "save", label: animated ? "Save" : "Save image", onClick: () => run(() => saveMedia(url, fileName), "Saved", "Couldn't save it") },
      {
        id: "copy-link",
        label: "Copy link",
        onClick: () => run(() => navigator.clipboard.writeText(url), "Link copied", "Couldn't copy the link"),
      },
      { id: "open", label: "Open original", onClick: () => safeWindowOpen(url) },
    ]);
  };

  if (!open || typeof document === "undefined") return null;

  const nameStyle = authorColor ? { color: authorColor } : author ? getUsernameStyle(author) : undefined;
  const resolved = safeImageUrl(src);
  const hasPrev = !!onPrev && !!position && position.index > 0;
  const hasNext = !!onNext && !!position && position.index < position.total - 1;
  const mediaClass = `max-h-[calc(100vh-152px)] max-w-[calc(100vw-160px)] select-none rounded-[6px] object-contain transition-transform duration-200 ease-out ${
    zoomIndex > 0 ? "cursor-zoom-out" : "cursor-zoom-in"
  }`;
  const mediaStyle = { transform: `scale(${zoom})`, transformOrigin: origin };

  return createPortal(
    <div className="fixed inset-0" style={{ zIndex: OVERLAY_Z.lightbox }} role="dialog" aria-modal="true" aria-label="Image viewer">
      <button
        type="button"
        className="overlay-fade absolute inset-0 bg-black"
        onClick={onClose}
        aria-label="Close viewer"
      />

      {/* Top bar: who posted it on the left, tools on the right. */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex h-16 items-center justify-between gap-4 px-5">
        <div className="pointer-events-auto flex min-w-0 items-center gap-3">
          {author && (
            <>
              <Avatar profile={author} size="sm" />
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[14px] font-medium leading-tight">
                  <span className="truncate" style={nameStyle}>{displayName(author)}</span>
                  {isOwn && (
                    <span className="rounded border border-white/15 px-1 text-[10px] font-semibold uppercase tracking-wide text-white/60">
                      You
                    </span>
                  )}
                  <PlatformBadge userId={author?.id} />
                </p>
                {createdAt && (
                  <time className="block text-[12px] leading-tight text-white/50">{formatMessageTime(createdAt)}</time>
                )}
              </div>
            </>
          )}
          {position && position.total > 1 && (
            <span className="ml-1 rounded-md border border-white/12 px-2 py-0.5 text-[12px] tabular-nums text-white/60">
              {position.index + 1} / {position.total}
            </span>
          )}
        </div>

        <div className="pointer-events-auto flex shrink-0 items-center gap-1 rounded-[12px] border border-white/10 bg-[#141519] p-1">
          <ToolbarButton label="Zoom out (−)" onClick={zoomOut} disabled={zoomIndex === 0}>
            <IconZoomOut size={18} />
          </ToolbarButton>
          <button
            type="button"
            onClick={() => setZoomIndex(0)}
            title="Reset zoom (0)"
            className="h-8 w-12 rounded-[8px] text-[12px] tabular-nums text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            {Math.round(zoom * 100)}%
          </button>
          <ToolbarButton label="Zoom in (+)" onClick={zoomIn} disabled={zoomIndex === ZOOM_STEPS.length - 1}>
            <IconZoomIn size={18} />
          </ToolbarButton>
          <span aria-hidden className="mx-1 h-5 w-px bg-white/10" />
          <ToolbarButton label="Download" onClick={() => run(() => saveMedia(src, fileName), "Saved", "Couldn't save it")}>
            <IconDownload size={18} />
          </ToolbarButton>
          <ToolbarButton label="Open original" onClick={() => safeWindowOpen(src)}>
            <IconExternalLink size={18} />
          </ToolbarButton>
          <span aria-hidden className="mx-1 h-5 w-px bg-white/10" />
          <ToolbarButton label="Close (Esc)" onClick={onClose}>
            <IconClose size={18} />
          </ToolbarButton>
        </div>
      </header>

      {/* Stage. Clicks on the empty area fall through to the backdrop and close. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-12 top-16 flex items-center justify-center overflow-hidden">
        {!resolved ? (
          <p className="text-[14px] text-white/60">Couldn&apos;t load this image.</p>
        ) : (
          // The entrance animation lives on this wrapper: it ends holding a
          // transform of its own, which on the media itself overrode the zoom.
          <div key={resolved} className="modal-pop pointer-events-none flex items-center justify-center">
          {animated ? (
          <video
            src={resolved}
            autoPlay
            loop
            muted
            playsInline
            onClick={onImageClick}
            onContextMenu={onMediaContextMenu}
            className={`pointer-events-auto ${mediaClass}`}
            style={mediaStyle}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolved}
            alt={alt}
            onClick={onImageClick}
            onContextMenu={onMediaContextMenu}
            draggable={false}
            className={`pointer-events-auto ${mediaClass}`}
            style={mediaStyle}
          />
          )}
          </div>
        )}
      </div>

      {hasPrev && (
        <SideButton side="left" label="Previous image (←)" onClick={onPrev!}>
          <IconChevronLeft size={22} />
        </SideButton>
      )}
      {hasNext && (
        <SideButton side="right" label="Next image (→)" onClick={onNext!}>
          <IconChevronRight size={22} />
        </SideButton>
      )}

      <footer className="pointer-events-none absolute inset-x-0 bottom-0 flex h-12 items-center justify-center px-6">
        <p className="truncate text-[12.5px] text-white/45">{fileName}</p>
      </footer>

      {toast && (
        <div
          role="status"
          className="absolute bottom-14 left-1/2 -translate-x-1/2 rounded-[10px] border border-white/10 bg-[#141519] px-3.5 py-2 text-[13px] text-white"
        >
          {toast}
        </div>
      )}
    </div>,
    document.body,
  );
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-[8px] text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function SideButton({
  side,
  label,
  onClick,
  children,
}: {
  side: "left" | "right";
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-[#141519] text-white/80 transition-colors hover:bg-[#1d1e23] hover:text-white ${
        side === "left" ? "left-5" : "right-5"
      }`}
    >
      {children}
    </button>
  );
}

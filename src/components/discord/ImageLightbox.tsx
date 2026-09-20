"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/ui/Avatar";
import { PlatformBadge } from "@/components/ui/PlatformBadge";
import { safeDownload, safeImageUrl, safeWindowOpen } from "@/lib/safe-url";
import {
  IconClose,
  IconDownload,
  IconExternalLink,
  IconZoomIn,
  IconZoomOut,
} from "@/components/icons";
import { formatMessageTime, displayName } from "@/lib/utils";
import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
import { getUsernameStyle } from "@/lib/profileColor";
import type { Profile } from "@/lib/supabase/types";

const ZOOM_STEPS = [1, 1.5, 2, 3, 4];

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
}: ImageLightboxProps) {
  const [zoomIndex, setZoomIndex] = useState(0);
  const zoom = ZOOM_STEPS[zoomIndex];

  // Scroll lock + topmost-only Escape come from the shared hook (replacing
  // the local body-overflow effect); zoom keys stay local.
  useOverlayDismiss(onClose, open);

  useEffect(() => {
    if (!open) {
      setZoomIndex(0);
      return;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "+" || e.key === "=") setZoomIndex((i) => Math.min(i + 1, ZOOM_STEPS.length - 1));
      if (e.key === "-") setZoomIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const zoomIn = useCallback(() => {
    setZoomIndex((i) => Math.min(i + 1, ZOOM_STEPS.length - 1));
  }, []);

  const zoomOut = useCallback(() => {
    setZoomIndex((i) => Math.max(i - 1, 0));
  }, []);

  if (!open || typeof document === "undefined") return null;

  const nameStyle = authorColor
    ? { color: authorColor }
    : author
      ? getUsernameStyle(author)
      : undefined;

  return createPortal(
    <div className="fixed inset-0 z-[150]" role="dialog" aria-modal="true" aria-label="Image preview">
      <button
        type="button"
        className="absolute inset-0 bg-overlay-scrim-strong overlay-fade backdrop-blur-md"
        onClick={onClose}
        aria-label="Close preview"
      />

      <div className="pointer-events-none absolute inset-0 flex flex-col">
        <div className="pointer-events-auto flex shrink-0 justify-end gap-1 p-4">
          <ToolbarButton
            label="Zoom out"
            onClick={zoomOut}
            disabled={zoomIndex === 0}
          >
            <IconZoomOut size={22} />
          </ToolbarButton>
          <ToolbarButton
            label="Zoom in"
            onClick={zoomIn}
            disabled={zoomIndex === ZOOM_STEPS.length - 1}
          >
            <IconZoomIn size={22} />
          </ToolbarButton>
          <ToolbarButton label="Download" onClick={() => safeDownload(src, fileName)}>
            <IconDownload size={22} />
          </ToolbarButton>
          <ToolbarButton label="Open in browser" onClick={() => safeWindowOpen(src)}>
            <IconExternalLink size={22} />
          </ToolbarButton>
          <ToolbarButton label="Close" onClick={onClose}>
            <IconClose size={22} />
          </ToolbarButton>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center px-6 pb-8 pt-2">
          <div
            className="modal-pop pointer-events-auto flex max-h-full max-w-[min(56rem,92vw)] flex-col overflow-hidden rounded-lg bg-overlay-media shadow-2xl ring-1 ring-divider"
            onClick={(e) => e.stopPropagation()}
          >
            {author && (
              <header className="flex shrink-0 items-center gap-3 border-b border-black/25 px-4 py-3">
                <Avatar profile={author} size="sm" />
                <div className="min-w-0 flex flex-wrap items-baseline gap-2">
                  <span className="text-[15px] font-medium" style={nameStyle}>
                    {displayName(author)}
                  </span>
                  {isOwn && (
                    <span className="rounded bg-brand/30 px-1 text-[10px] font-semibold text-brand">You</span>
                  )}
                  <PlatformBadge userId={author?.id} />
                  {createdAt && (
                    <time className="text-xs text-text-muted">{formatMessageTime(createdAt)}</time>
                  )}
                </div>
              </header>
            )}

            <div className="min-h-0 overflow-auto p-4">
              <div className="flex justify-center">
                {(() => {
                  const resolved = safeImageUrl(src);
                  if (!resolved) {
                    return (
                      <p className="py-10 text-sm text-text-muted">Couldn't load this image.</p>
                    );
                  }
                  return animated ? (
                    <video
                      src={resolved}
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="max-h-[min(70vh,720px)] max-w-full rounded object-contain transition-transform duration-200 ease-out"
                      style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resolved}
                      alt={alt}
                      className="max-h-[min(70vh,720px)] max-w-full rounded object-contain transition-transform duration-200 ease-out"
                      style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}
                      draggable={false}
                    />
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>
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
      className="flex h-10 w-10 items-center justify-center rounded-full text-text-normal transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

"use client";

/**
 * Crop, zoom and move a picture before it is uploaded: drag to move, scroll
 * or use the slider to zoom. Used for profile pictures (round) and banners
 * (wide). The result is a new image file cut to exactly what the frame shows.
 *
 * Animated GIFs skip this (a canvas keeps only the first frame), so callers
 * upload those as they are.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
import { IconClose } from "@/components/icons";
import { useI18n } from "@/contexts/I18nContext";
import { BUSY_BUTTON, BusyLabel } from "@/components/ui/LoadingDots";

export type CropShape = "avatar" | "banner";

const FRAME = {
  avatar: { w: 280, h: 280, outW: 512, outH: 512 },
  banner: { w: 480, h: 160, outW: 1500, outH: 500 },
} as const;

const MAX_ZOOM = 4;

export function ImageCropModal({
  file,
  shape,
  onCancel,
  onDone,
}: {
  file: File | null;
  shape: CropShape;
  onCancel: () => void;
  onDone: (cropped: File) => void | Promise<void>;
}) {
  const { t } = useI18n();
  const [src, setSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useOverlayDismiss(() => { if (!busy) onCancel(); }, !!file);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setSrc(url);
    setNatural(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Frame size: shrinks on narrow screens, keeping its shape.
  const [frameScale, setFrameScale] = useState(1);
  useEffect(() => {
    const fit = () => setFrameScale(Math.min(1, (window.innerWidth - 80) / FRAME[shape].w));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [shape]);
  const fw = FRAME[shape].w * frameScale;
  const fh = FRAME[shape].h * frameScale;

  // At zoom 1 the picture just covers the frame.
  const base = natural ? Math.max(fw / natural.w, fh / natural.h) : 1;
  const dispW = natural ? natural.w * base * zoom : fw;
  const dispH = natural ? natural.h * base * zoom : fh;

  // Keep the frame covered: the picture's edges never come inside it.
  const clamp = useCallback(
    (x: number, y: number, w = dispW, h = dispH) => ({
      x: Math.min(Math.max(x, (fw - w) / 2), (w - fw) / 2),
      y: Math.min(Math.max(y, (fh - h) / 2), (h - fh) / 2),
    }),
    [dispW, dispH, fw, fh],
  );

  const setZoomKeep = (z: number) => {
    const next = Math.min(Math.max(z, 1), MAX_ZOOM);
    if (!natural) return setZoom(next);
    const ratio = next / zoom;
    const w = natural.w * base * next;
    const h = natural.h * base * next;
    setOffset((o) => clamp(o.x * ratio, o.y * ratio, w, h));
    setZoom(next);
  };

  const save = async () => {
    if (!natural || !imgRef.current || !file || busy) return;
    setBusy(true);
    try {
      const { outW, outH } = FRAME[shape];
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      // The frame's top-left corner, in the picture's own pixels.
      const scale = base * zoom;
      const sx = (dispW / 2 - offset.x - fw / 2) / scale;
      const sy = (dispH / 2 - offset.y - fh / 2) / scale;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(imgRef.current, sx, sy, fw / scale, fh / scale, 0, 0, outW, outH);
      const type = file.type === "image/png" ? "image/png" : "image/webp";
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92));
      if (!blob) throw new Error("no blob");
      const name = file.name.replace(/\.[^.]+$/, "") + (type === "image/png" ? ".png" : ".webp");
      await onDone(new File([blob], name, { type }));
    } catch {
      // Fall back to the original picture rather than losing the upload.
      await onDone(file);
    } finally {
      setBusy(false);
    }
  };

  if (!file || !src || typeof document === "undefined") return null;
  const title = shape === "avatar" ? t("Edit profile picture") : t("Edit banner");

  return createPortal(
    <div className="fixed inset-0 z-[240] flex items-center justify-center p-4">
      <button type="button" aria-label={t("Cancel")} tabIndex={-1} className="overlay-fade absolute inset-0 bg-overlay-scrim-strong" onClick={() => { if (!busy) onCancel(); }} />
      <div role="dialog" aria-modal="true" aria-label={title} className="modal-pop relative w-full max-w-[560px] overflow-hidden rounded-2xl border border-border-subtle bg-bg-primary shadow-[var(--elevation-high)]">
        <div className="flex items-center gap-3 px-5 pb-1 pt-4">
          <h2 className="flex-1 text-[18px] font-bold leading-6 text-header-primary">{title}</h2>
          <button type="button" onClick={onCancel} disabled={busy} aria-label={t("Close")} className="flex h-8 w-8 items-center justify-center rounded-lg text-interactive-normal hover:bg-interactive-hover hover:text-interactive-active">
            <IconClose size={18} />
          </button>
        </div>
        <p className="px-5 text-[13px] text-text-muted">{t("Drag to move. Scroll or use the slider to zoom.")}</p>

        <div className="mx-5 mt-4 flex justify-center rounded-xl bg-bg-secondary py-6">
          <div
            className="relative cursor-grab touch-none select-none overflow-hidden active:cursor-grabbing"
            style={{ width: fw, height: fh, borderRadius: shape === "avatar" ? "9999px" : 12 }}
            onPointerDown={(e) => {
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
              drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d) return;
              setOffset(clamp(d.ox + e.clientX - d.x, d.oy + e.clientY - d.y));
            }}
            onPointerUp={() => { drag.current = null; }}
            onPointerCancel={() => { drag.current = null; }}
            onWheel={(e) => setZoomKeep(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={src}
              alt=""
              draggable={false}
              onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
              style={{ width: dispW, height: dispH, transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))` }}
            />
            <span aria-hidden className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-white/70" style={{ borderRadius: "inherit" }} />
          </div>
        </div>

        <div className="flex items-center gap-3 px-5 pt-4">
          <span className="text-[12px] font-semibold text-text-muted">−</span>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            aria-label={t("Zoom")}
            onChange={(e) => setZoomKeep(Number(e.target.value))}
            className="flex-1 accent-[var(--color-brand)]"
          />
          <span className="text-[14px] font-semibold text-text-muted">+</span>
          <button
            type="button"
            onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}
            className="rounded-lg px-2 py-1 text-[12px] font-semibold text-text-muted hover:bg-interactive-hover hover:text-text-normal"
          >
            {t("Reset")}
          </button>
        </div>

        <div className="mt-4 flex justify-end gap-2 border-t border-border-subtle bg-bg-secondary px-5 py-3">
          <button type="button" onClick={onCancel} disabled={busy} className="h-9 rounded-lg px-4 text-[14px] font-semibold text-text-normal hover:underline disabled:opacity-50">
            {t("Cancel")}
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!natural || busy}
            className={`h-9 rounded-lg bg-brand px-4 text-[14px] font-semibold text-brand-foreground hover:bg-brand-hover disabled:opacity-60 ${busy ? BUSY_BUTTON : ""}`}
          >
            <BusyLabel busy={busy}>{t("Apply")}</BusyLabel>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

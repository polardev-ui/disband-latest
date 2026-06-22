"use client";

import { useRef, useState } from "react";
import { IconClose } from "@/components/icons";
import type { AvatarCrop } from "@/lib/utils";

interface AvatarCropModalProps {
  open: boolean;
  imageUrl: string;
  onClose: () => void;
  onSave: (crop: AvatarCrop) => void;
}

export function AvatarCropModal({ open, imageUrl, onClose, onSave }: AvatarCropModalProps) {
  const [zoom, setZoom] = useState(1);
  const [posX, setPosX] = useState(0);
  const [posY, setPosY] = useState(0);

  if (!open) return null;

  const previewStyle = {
    objectFit: "cover" as const,
    objectPosition: `${50 + posX}% ${50 + posY}%`,
    transform: `scale(${zoom})`,
    transformOrigin: `${50 + posX}% ${50 + posY}%`,
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/80" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-md rounded-lg bg-bg-primary p-6 shadow-2xl">
        <button type="button" onClick={onClose} className="absolute right-4 top-4 text-text-muted">
          <IconClose size={24} />
        </button>
        <h2 className="text-lg font-bold">Adjust profile picture</h2>
        <div className="relative mx-auto mt-4 h-48 w-48 overflow-hidden rounded-full border-4 border-brand bg-bg-accent">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Crop preview"
            className="h-full w-full"
            style={previewStyle}
          />
        </div>
        <label className="mt-4 block text-xs font-bold uppercase text-text-muted">Zoom</label>
        <input type="range" min={1} max={3} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full" />
        <label className="mt-2 block text-xs font-bold uppercase text-text-muted">Horizontal</label>
        <input type="range" min={-50} max={50} value={posX} onChange={(e) => setPosX(Number(e.target.value))} className="w-full" />
        <label className="mt-2 block text-xs font-bold uppercase text-text-muted">Vertical</label>
        <input type="range" min={-50} max={50} value={posY} onChange={(e) => setPosY(Number(e.target.value))} className="w-full" />
        <button
          type="button"
          onClick={() => onSave({ zoom, x: posX, y: posY })}
          className="mt-4 w-full rounded bg-brand py-2.5 text-sm font-semibold text-white hover:bg-brand-hover"
        >
          Save
        </button>
      </div>
    </div>
  );
}

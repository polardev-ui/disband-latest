"use client";

import { useCallback, useEffect, useState } from "react";

export const ZOOM_KEY = "disband:zoom";
export const ZOOM_EVENT = "disband:zoom-changed";
export const MIN_ZOOM = 0.75;
export const MAX_ZOOM = 1.5;
export const ZOOM_STEP = 0.1;

export function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100));
}

export function getStoredZoom(): number {
  if (typeof window === "undefined") return 1;
  const raw = window.localStorage.getItem(ZOOM_KEY);
  if (!raw) return 1;
  const parsed = Number.parseFloat(raw);
  if (Number.isNaN(parsed)) return 1;
  return clampZoom(parsed);
}

export function persistZoom(value: number): void {
  window.localStorage.setItem(ZOOM_KEY, String(clampZoom(value)));
  window.dispatchEvent(new Event(ZOOM_EVENT));
}

type SetZoom = (value: number | ((prev: number) => number)) => void;

export function useZoom(): [number, SetZoom] {
  const [zoom, setZoomState] = useState<number>(getStoredZoom);

  useEffect(() => {
    const onZoom = () => setZoomState(getStoredZoom());
    const onStorage = (e: StorageEvent) => {
      if (e.key === ZOOM_KEY) onZoom();
    };
    window.addEventListener(ZOOM_EVENT, onZoom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(ZOOM_EVENT, onZoom);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(ZOOM_KEY, String(clampZoom(zoom)));
    window.dispatchEvent(new Event(ZOOM_EVENT));
  }, [zoom]);

  const setZoom = useCallback<SetZoom>((value) => {
    setZoomState((prev) => clampZoom(typeof value === "function" ? value(prev) : value));
  }, []);

  return [zoom, setZoom];
}

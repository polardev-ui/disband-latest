"use client";

import { useEffect } from "react";

/** Resting this long on a row counts as intent; passing over it doesn't. */
const HOVER_INTENT_MS = 80;

/**
 * Calls `prefetch(id)` for rows marked with `attribute` when the pointer
 * rests on one, and straight away when it's pressed (a click lands ~100 ms
 * after the press). One delegated listener for the whole app, so rows need
 * nothing but the attribute.
 */
export function usePrefetchOnHover(attribute: string, prefetch: (id: string) => void) {
  useEffect(() => {
    const selector = `[${attribute}]`;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let current: string | null = null;
    const idOf = (target: EventTarget | null) =>
      (target instanceof Element ? target.closest(selector)?.getAttribute(attribute) : null) ?? null;
    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const onOver = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const id = idOf(event.target);
      if (id === current) return;
      current = id;
      clear();
      if (id) timer = setTimeout(() => prefetch(id), HOVER_INTENT_MS);
    };
    const onDown = (event: PointerEvent) => {
      const id = idOf(event.target);
      if (id) prefetch(id);
    };
    document.addEventListener("pointerover", onOver, { passive: true });
    document.addEventListener("pointerdown", onDown, { capture: true, passive: true });
    return () => {
      clear();
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerdown", onDown, { capture: true });
    };
  }, [attribute, prefetch]);
}

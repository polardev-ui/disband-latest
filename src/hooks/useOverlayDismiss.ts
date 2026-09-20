"use client";

import { useEffect, useRef } from "react";
import { handleTopmostEscape, lockBodyScroll, pushEscapeHandler } from "@/lib/overlay";

// Shared overlay behavior for the web UI revamp: topmost-only Escape to
// close, reference-counted body scroll lock, and focus restoration.
//
// Every overlay registers its own window keydown listener, so a naive
// `e.key === "Escape" && onClose()` closes ALL stacked layers at once
// (AvatarCrop over Settings, confirm over BotsPanel, …). Routing through the
// pushEscapeHandler stack means one press closes exactly one layer.
//
// The effect only re-runs when `active` flips: `onClose` is read through a
// ref so unstable parent callbacks can't re-trigger focus capture/restore
// (which would yank focus out of the dialog on every parent re-render).
export function useOverlayDismiss(onClose: () => void, active = true) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    // Capture focus before the overlay (or its autoFocus child) takes it so
    // close returns the user to where they were.
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const releaseEscape = pushEscapeHandler(() => closeRef.current());
    const releaseScroll = lockBodyScroll();
    const onKey = (e: KeyboardEvent) => {
      // Topmost-only with a single-answer guard (see overlay.ts).
      handleTopmostEscape(e);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      releaseEscape();
      releaseScroll();
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}

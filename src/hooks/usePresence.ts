"use client";

import { useEffect, useState } from "react";

// Exit-animation presence: keeps a layer mounted just long enough for its
// reverse animation to play, then unmounts it. `open` drives the component;
// for `duration` ms after it flips false the caller should still render the
// layer with `exiting === true` and add the matching class
// (`modal-pop-out` / `overlay-fade-out` / `pop-out`).
//
// Reduced motion (the OS preference or the in-app "Reduced" setting) collapses
// the window to zero so dismissal stays instant; the exit classes are also
// neutered in globals.css so nothing lingers at opacity 0.
export function usePresence(open: boolean, duration = 190) {
  const [mounted, setMounted] = useState(open);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setExiting(false);
      return;
    }
    if (!mounted) return;
    setExiting(true);
    const wait = exitDuration(duration);
    if (wait <= 0) {
      setMounted(false);
      setExiting(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setMounted(false);
      setExiting(false);
    }, wait);
    return () => window.clearTimeout(timer);
  }, [open, mounted, duration]);

  return { mounted, exiting };
}

function exitDuration(fallback: number): number {
  if (typeof document === "undefined" || typeof window === "undefined") return fallback;
  const pref = document.documentElement.getAttribute("data-motion");
  if (pref === "reduced") return 0;
  if (pref !== "full") {
    try {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return 0;
    } catch {
      /* matchMedia unavailable */
    }
  }
  return fallback;
}

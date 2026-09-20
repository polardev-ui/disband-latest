"use client";

// Animation preference for the web UI revamp (final pass). Three modes:
// "system" follows the OS (default), "full" forces everything on, "reduced"
// forces the calm path. Applied as data-motion on <html>; the reduced path
// is enforced purely in CSS (globals.css), so flips are instant and need no
// React state outside the settings control itself.

export type MotionPreference = "system" | "full" | "reduced";

const STORAGE_KEY = "disband:motion";

const VALID: MotionPreference[] = ["system", "full", "reduced"];

export function getStoredMotion(): MotionPreference {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "full" || stored === "reduced" || stored === "system") return stored;
  } catch {
    /* Session-only preference. */
  }
  return "system";
}

export function applyMotion(pref: MotionPreference) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (pref === "reduced") {
    root.setAttribute("data-motion", "reduced");
  } else if (pref === "full") {
    root.setAttribute("data-motion", "full");
  } else {
    root.removeAttribute("data-motion");
  }
}

export function setStoredMotion(pref: MotionPreference) {
  applyMotion(pref);
  try {
    window.localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    /* Session-only preference. */
  }
}

export function osPrefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function isMotionReduced(pref: MotionPreference): boolean {
  if (pref === "reduced") return true;
  if (pref === "full") return false;
  return osPrefersReducedMotion();
}

export { VALID as MOTION_OPTIONS };

"use client";

/**
 * Lightweight runtime detection so shared components can adapt to the
 * environment without separate desktop/web codepaths.
 */
export function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  // Tauri v2 always injects __TAURI_INTERNALS__; v1 injects __TAURI__; withGlobalTauri exposes window.isTauri.
  if ("__TAURI_INTERNALS__" in window || "__TAURI__" in window || "isTauri" in window) return true;
  // Fallback: Tauri production builds serve from tauri:// or asset: schemes.
  const proto = window.location.protocol;
  return proto === "tauri:" || proto === "asset:";
}

export function platformLabel(): "Desktop" | "Web" {
  return isTauri() ? "Desktop" : "Web";
}

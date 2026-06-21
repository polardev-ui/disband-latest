"use client";

/**
 * Lightweight runtime detection so shared components can adapt to the
 * environment without separate desktop/web codepaths.
 */
export function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  // Tauri v2 injects these globals into the webview.
  return (
    "__TAURI_INTERNALS__" in window ||
    "__TAURI__" in window ||
    "isTauri" in window
  );
}

export function platformLabel(): "Desktop" | "Web" {
  return isTauri() ? "Desktop" : "Web";
}

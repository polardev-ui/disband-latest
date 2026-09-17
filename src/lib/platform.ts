"use client";

export function isTauri(): boolean {
  if (typeof window === "undefined") return false;

  if ("__TAURI_INTERNALS__" in window || "__TAURI__" in window || "isTauri" in window) return true;

  const proto = window.location.protocol;
  return proto === "tauri:" || proto === "asset:";
}

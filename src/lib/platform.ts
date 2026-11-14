"use client";

import { PUBLIC_ENV } from "@/lib/public-env";

export function isTauri(): boolean {
  if (typeof window === "undefined") return false;

  if ("__TAURI_INTERNALS__" in window || "__TAURI__" in window || "isTauri" in window) return true;

  const proto = window.location.protocol;
  return proto === "tauri:" || proto === "asset:";
}


/**
 * A link to a page on the Disband website, for `<a target="_blank">`.
 * On the web a relative path is fine. In the desktop app it resolves inside
 * the app bundle, where those pages don't exist, so the link did nothing
 * (the Help button); the full address is opened in the browser instead.
 */
export function websiteHref(path: string): string {
  if (!isTauri()) return path;
  const base = PUBLIC_ENV.webAppUrl.replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

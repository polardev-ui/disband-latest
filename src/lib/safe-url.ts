import { cdnImage } from "@/lib/media/cdn";
import { isTauri } from "@/lib/platform";

const HTTPS_RE = /^https:\/\//i;

export function isSafeUrl(url: string): boolean {
  return HTTPS_RE.test(url) || url.startsWith("blob:");
}

export function safeDownload(url: string, fileName: string): void {
  if (!isSafeUrl(url)) return;
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener noreferrer";
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function safeWindowOpen(url: string): void {
  if (!isSafeUrl(url)) return;
  // The desktop WebView ignores window.open (no new-window handler), so
  // "Open original" did nothing there. Hand https links to the system browser.
  if (isTauri() && url.startsWith("https:")) {
    void import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke("plugin:opener|open_url", { url }))
      .catch(() => undefined);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export function safeImageUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  if (!isSafeUrl(url)) return null;
  return cdnImage(url);
}

/**
 * A small square copy of an uploaded image, for icons. cdn.disband.dev makes
 * and caches it (`?w=`), so a space icon drawn at 44px no longer downloads
 * the multi-megabyte original. `still` asks for the first frame only, so an
 * animated GIF icon costs a few KB until someone hovers it or opens the
 * space. Images hosted anywhere else are returned unchanged.
 */
const THUMB_SIZES = [64, 96, 128, 256] as const;
export function thumbImageUrl(
  url: string | undefined | null,
  px: number,
  opts: { still?: boolean } = {},
): string | null {
  const safe = safeImageUrl(url);
  if (!safe) return null;
  let parsed: URL;
  try {
    parsed = new URL(safe);
  } catch {
    return safe;
  }
  if (parsed.hostname !== "cdn.disband.dev" || !parsed.pathname.startsWith("/v1/images/")
      || !/\.(png|jpe?g|gif|webp|avif)$/i.test(parsed.pathname)) {
    return safe;
  }
  // Twice the drawn size, for sharp edges on high-density screens.
  const size = THUMB_SIZES.find((s) => s >= px * 2) ?? 256;
  parsed.search = `?w=${size}${opts.still ? "&still=1" : ""}`;
  return parsed.toString();
}

/** An image that may be animated (only GIFs and WebP/AVIF can be). */
export function mayBeAnimated(url: string | undefined | null): boolean {
  return !!url && /\.(gif|webp|avif)(\?|$)/i.test(url);
}

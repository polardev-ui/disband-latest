import { cdnImage } from "@/lib/media/cdn";

const HTTPS_RE = /^https:\/\//i;

export function isSafeUrl(url: string): boolean {
  // https: for remote content; blob: for same-origin object URLs the app
  // creates itself (optimistic upload previews, avatar crops). A blob: URL
  // can only ever reference this origin's memory, so it is safe to load.
  return HTTPS_RE.test(url) || url.startsWith("blob:");
}

export function assertSafeUrlScheme(url: string): void {
  if (!isSafeUrl(url)) {
    throw new Error("Blocked: only https:// URLs are allowed");
  }
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
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * The URL to actually load an image from.
 *
 * Every image in the app renders through here, which makes it the one place
 * worth mapping legacy storage URLs onto the CDN. Rows were rewritten in the
 * database, but URLs also arrive from client caches, older mobile builds and
 * pasted links, and those never went through that migration.
 */
export function safeImageUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  if (!isSafeUrl(url)) return null;
  return cdnImage(url);
}

/**
 * What a bare link in a message *is*: a GIF, a video, an image, or an
 * ordinary link. Client-side only, and deliberately pure — no React, no
 * fetching — so both the chat renderer and tests can import it.
 *
 * Host matching is by suffix rather than an exact list: GIFs arrive from
 * `media1.giphy.com`, `media4.giphy.com`, `giphy.com/gifs/...` and other
 * spellings, and an exact-match list quietly demotes those to a plain link
 * card — one with no favorite star, since only GIF embeds are starable. A
 * bare `.gif` path already matched on any host; the host rules close the
 * extensionless CDN case.
 */

const GIF_EXTS = new Set(["gif"]);
const VIDEO_EXTS = new Set(["mp4", "webm", "mov", "m4v"]);
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "avif", "bmp"]);
const GIF_HOSTS = ["media.giphy.com", "media.tenor.com", "c.tenor.com", "i.imgur.com"];

function pathOf(url: URL): string {
  return url.pathname.toLowerCase();
}

function pathExt(url: URL): string | null {
  const m = pathOf(url).match(/\.([a-z0-9]{2,5})$/);
  return m ? m[1] : null;
}

/** gif, video, or image — or null for ordinary links. */
export function classifyLinkUrl(url: string): "gif" | "video" | "image" | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const ext = pathExt(parsed);
  if (ext && GIF_EXTS.has(ext)) return "gif";
  if (ext && VIDEO_EXTS.has(ext)) return "video";
  if (ext && IMAGE_EXTS.has(ext)) return "image";
  if (GIF_HOSTS.includes(host)) return "gif";
  if (/(^|\.)(giphy|tenor)\.com$/.test(host)) return "gif";
  if (/(^|\.)imgur\.com$/.test(host) && pathOf(parsed).endsWith(".gif")) return "gif";
  return null;
}

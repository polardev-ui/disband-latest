/**
 * Stable identity for a favorited GIF URL.
 *
 * Favorites are keyed by URL, but the same GIF arrives spelled several ways:
 * the picker stores the canonical CDN URL, a paste carries tracking params
 * (`?utm_source=...`), another client rewrites `www.` or adds a fragment, an
 * upload proxy appends a size query. Comparing raw strings makes "already
 * saved" invisible and leaves an unfavorite unable to find its own row.
 *
 * So a key is: host (lowercased, `www.` stripped) + path (trailing slashes
 * stripped). Query and fragment are dropped — on GIF CDNs they carry sizing
 * and tracking, never identity (the GIF id lives in the path). Anything that
 * is not parseable falls back to the trimmed original rather than collapsing
 * unrelated strings together.
 *
 * Giphy is the exception to "host + path": the same GIF comes back from
 * media0–media4 with a per-search `v1.<token>` segment and a rendition file
 * name, so every search spells it differently. Its key is just the GIF id.
 * Keep this in step with `gif_favorite_id` (0194) and the iOS
 * `GifFavoritesService.key`.
 */
const GIPHY_HOST = /^(?:media\d*\.|i\.)?giphy\.com$/;
const GIPHY_PATH = /^\/media\/(?:v1\.[^/]+\/)?([^/]+)\/[^/]+$/;

export function gifFavKey(url: string): string {
  const raw = url.trim();
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/+$/, "");
    const giphy = GIPHY_HOST.test(host) ? GIPHY_PATH.exec(path) : null;
    if (giphy) return `giphy.com/media/${giphy[1]}`;
    return host + path;
  } catch {
    return raw;
  }
}

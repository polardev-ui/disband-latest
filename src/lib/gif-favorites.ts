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
 */
export function gifFavKey(url: string): string {
  const raw = url.trim();
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/+$/, "");
    return host + path;
  } catch {
    return raw;
  }
}

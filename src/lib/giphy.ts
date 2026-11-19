import { PUBLIC_ENV } from "@/lib/public-env";

export interface GiphyImage {
  id: string;
  title?: string;

  url?: string;

  preview?: string;

  mp4?: string;
  width?: number;
  height?: number;

  images?: {
    fixed_width?: { url?: string };
    original?: { url?: string };
  };
}

interface GiphySearchResponse {
  results?: GiphyImage[];
  data?: GiphyImage[];
  nextOffset?: number;
}

const GIPHY_SEARCH = `${PUBLIC_ENV.mediaApiUrl.replace(/\/$/, "")}/giphy/search`;

export async function searchGifs(query: string, limit = 20): Promise<GiphyImage[]> {
  const trimmed = query.trim();
  const q = trimmed ? encodeURIComponent(trimmed) : "";
  const res = await fetch(
    trimmed ? `${GIPHY_SEARCH}?q=${q}&limit=${limit}` : `${GIPHY_SEARCH}?limit=${limit}`,
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body || `Failed to load GIFs (${res.status})`);
  }
  const json = (await res.json()) as GiphySearchResponse;
  return json.results ?? json.data ?? [];
}

const HTTPS_RE = /^https:\/\//i;

const GIF_HOSTS = [
  /^(?:[a-z0-9-]+\.)*giphy\.com$/i,
  /^(?:[a-z0-9-]+\.)*klipy\.com$/i,
  /^(?:[a-z0-9-]+\.)*klipy\.co$/i,
];

function isSafeGifUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return HTTPS_RE.test(url) && GIF_HOSTS.some((re) => re.test(parsed.hostname));
  } catch {
    return false;
  }
}

function isMp4(url: string): boolean {
  return /\.mp4(\?|$)/i.test(url);
}

const MP4_RENDITIONS = /\/(giphy|giphy-downsized|giphy-preview|giphy-loop)\.gif(\?|$)/i;

export function giphyMp4Url(gifUrl: string): string | null {
  if (!isSafeGifUrl(gifUrl)) return null;
  if (isMp4(gifUrl)) return gifUrl;

  if (MP4_RENDITIONS.test(gifUrl)) return gifUrl.replace(/\.gif(\?.*)?$/i, ".mp4$1");
  return null;
}

export function gifUrl(gif: GiphyImage): string | null {
  const url = gif.url
    ?? gif.images?.original?.url
    ?? gif.images?.fixed_width?.url
    ?? gif.preview
    ?? null;
  return url && HTTPS_RE.test(url) ? url : null;
}

export function gifPreviewUrl(gif: GiphyImage): string | null {
  const url = gif.preview ?? gif.images?.fixed_width?.url ?? gif.url ?? null;
  return url && HTTPS_RE.test(url) ? url : null;
}

export function giphyDisplayUrl(url: string): string {
  return giphyMp4Url(url) ?? url;
}

export function gifThumb(gif: GiphyImage): { src: string; isVideo: boolean } | null {
  const preview = gifPreviewUrl(gif);
  if (!preview) return null;

  if (gif.mp4 && HTTPS_RE.test(gif.mp4)) return { src: gif.mp4, isVideo: true };

  const rewritten = giphyThumbUrl(preview);
  return { src: rewritten, isVideo: isMp4(rewritten) };
}

export function giphyThumbUrl(previewUrl: string): string {

  if (
    isSafeGifUrl(previewUrl)
    && /giphy\.com$/i.test(new URL(previewUrl).hostname)
    && /\.gif(\?|$)/i.test(previewUrl)
  ) {
    return previewUrl.replace(/[^/]+$/i, "200w.mp4");
  }
  return previewUrl;
}

/**
 * A small animated copy of a saved GIF, for the picker's grid.
 *
 * Favourites are stored as the full-size original, which can be several MB.
 * Giphy publishes a 200px-wide WebP of every GIF under a fixed name, so that
 * is used directly; anything else (Klipy, our own uploads) goes through the
 * CDN's /gif/thumb, which makes and caches a scaled-down animated WebP.
 */
export function gifGridThumbUrl(url: string, width: 160 | 240 | 320 = 240): string {
  if (!HTTPS_RE.test(url)) return url;
  try {
    const host = new URL(url).hostname;
    if (/(?:^|\.)giphy\.com$/i.test(host) && /\/media\//i.test(url) && /\.(gif|webp)(\?|$)/i.test(url)) {
      return url.replace(/[^/?]+(\?.*)?$/i, "200w.webp");
    }
    if (/(?:^|\.)klipy\.com$|(?:^|\.)klipy\.co$|^cdn\.disband\.dev$/i.test(host)) {
      const base = PUBLIC_ENV.mediaApiUrl.replace(/\/$/, "");
      return `${base}/gif/thumb?w=${width}&url=${encodeURIComponent(url)}`;
    }
  } catch {
    // Not a URL we can shrink.
  }
  return url;
}

const searchCache = new Map<string, { at: number; results: GiphyImage[] }>();
const searchInflight = new Map<string, Promise<GiphyImage[]>>();
/** Results stay instant for a while within a session (the CDN caches them for hours too). */
const SEARCH_CACHE_MS = 10 * 60 * 1000;

function searchKey(query: string, limit: number): string {
  return `${limit}:${query.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

/** Already-fetched results for a query, if any (for showing them with no wait). */
export function cachedGifs(query: string, limit = 20): GiphyImage[] | null {
  const hit = searchCache.get(searchKey(query, limit));
  return hit && Date.now() - hit.at < SEARCH_CACHE_MS ? hit.results : null;
}

/**
 * searchGifs, remembered: the same query (Trending, a category, a word typed
 * again) answers from memory, and two calls for one query share a request.
 */
export async function searchGifsCached(query: string, limit = 20): Promise<GiphyImage[]> {
  const key = searchKey(query, limit);
  const hit = cachedGifs(query, limit);
  if (hit) return hit;
  let pending = searchInflight.get(key);
  if (!pending) {
    pending = searchGifs(query, limit)
      .then((results) => {
        searchCache.set(key, { at: Date.now(), results });
        return results;
      })
      .finally(() => searchInflight.delete(key));
    searchInflight.set(key, pending);
  }
  return pending;
}

/** Fetch in the background so a later click is instant. Errors are ignored. */
export function prefetchGifs(queries: string[], limit = 20): void {
  for (const q of queries) void searchGifsCached(q, limit).catch(() => undefined);
}

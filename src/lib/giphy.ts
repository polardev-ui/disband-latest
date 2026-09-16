import { PUBLIC_ENV } from "@/lib/public-env";

export interface GiphyImage {
  id: string;
  title?: string;
  /** Full-size animated GIF URL */
  url?: string;
  /** Small preview for the picker grid */
  preview?: string;
  /**
   * The same clip as video, when the provider publishes one.
   *
   * Worth having rather than deriving: an animated GIF is several times the
   * bytes of the equivalent mp4, and the only way to get one out of Giphy was
   * to swap `.gif` for `.mp4` and hope — which 403s for the renditions that
   * have none. Tenor simply says.
   */
  mp4?: string;
  width?: number;
  height?: number;
  /** Legacy Giphy API nested shape (fallback) */
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

/**
 * Hosts a GIF may come from.
 *
 * Klipy is where new ones come from. Giphy stays because every GIF already
 * sent lives on it, and dropping it would blank those messages retroactively
 * — an allowlist here decides whether an existing message still renders, not
 * only what the picker may return.
 */
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

/** True for a URL that is already video and needs no rewriting. */
function isMp4(url: string): boolean {
  return /\.mp4(\?|$)/i.test(url);
}

/**
 * Giphy CDN URL → MP4 for autoplay in chat, when one actually exists.
 *
 * This used to rewrite any `.gif` to `.mp4` by swapping the extension, but
 * Giphy does not publish an mp4 for every rendition — `giphy-downsized-medium`
 * is one of the ones that has none, so the invented URL came back 403 and the
 * message showed nothing at all. Only renditions known to carry an mp4 are
 * converted; everything else keeps the GIF, which always exists.
 */
const MP4_RENDITIONS = /\/(giphy|giphy-downsized|giphy-preview|giphy-loop)\.gif(\?|$)/i;

export function giphyMp4Url(gifUrl: string): string | null {
  if (!isSafeGifUrl(gifUrl)) return null;
  if (isMp4(gifUrl)) return gifUrl;
  // Tenor publishes its mp4 at a different path entirely, so there is nothing
  // to derive — a Tenor GIF URL stays a GIF unless the search result carried
  // the mp4 alongside it.
  if (MP4_RENDITIONS.test(gifUrl)) return gifUrl.replace(/\.gif(\?.*)?$/i, ".mp4$1");
  return null;
}

/**
 * The URL to send in chat.
 *
 * Deliberately the GIF and not the mp4, even though the mp4 is a fraction of
 * the bytes. What gets sent is stored on the message and rendered by every
 * client, and the mobile apps draw a `gif` attachment as an image — handing
 * them an mp4 would show nothing at all. The mp4 is used where only this
 * client sees it: the picker's own thumbnails.
 */
export function gifUrl(gif: GiphyImage): string | null {
  const url = gif.url
    ?? gif.images?.original?.url
    ?? gif.images?.fixed_width?.url
    ?? gif.preview
    ?? null;
  return url && HTTPS_RE.test(url) ? url : null;
}

/** Return the preview URL for the picker thumbnail grid. Passes through as-is. */
export function gifPreviewUrl(gif: GiphyImage): string | null {
  const url = gif.preview ?? gif.images?.fixed_width?.url ?? gif.url ?? null;
  return url && HTTPS_RE.test(url) ? url : null;
}

/** 
 * Convert a Giphy URL to MP4 display URL. 
 * Preserves the signed `v1.Y2lkPT...` prefix — Giphy's CDN requires it.
 */
export function giphyDisplayUrl(url: string): string {
  return giphyMp4Url(url) ?? url;
}

/**
 * What the picker grid should show for one result, and how to render it.
 *
 * The grid used a `<video>` for every thumbnail, which worked only because
 * every URL was rewritten into a Giphy mp4 first. A GIF URL in a `<video>`
 * renders nothing at all, so the tile has to know which of the two it holds
 * rather than assuming.
 */
export function gifThumb(gif: GiphyImage): { src: string; isVideo: boolean } | null {
  const preview = gifPreviewUrl(gif);
  if (!preview) return null;

  // A provider-supplied mp4 is both smaller and certain to exist.
  if (gif.mp4 && HTTPS_RE.test(gif.mp4)) return { src: gif.mp4, isVideo: true };

  const rewritten = giphyThumbUrl(preview);
  return { src: rewritten, isVideo: isMp4(rewritten) };
}

/** 
 * Animated thumbnail MP4 for the picker grid.
 * Giphy's `_s` preview stills (e.g. `100w_s.gif`) have no MP4 counterpart
 * (they 403), so rewrite to the always-available `200w.mp4` variant.
 */
export function giphyThumbUrl(previewUrl: string): string {
  // Tenor's preview URLs are already the right thing and have no such
  // sibling, so only Giphy's are rewritten.
  if (
    isSafeGifUrl(previewUrl)
    && /giphy\.com$/i.test(new URL(previewUrl).hostname)
    && /\.gif(\?|$)/i.test(previewUrl)
  ) {
    return previewUrl.replace(/[^/]+$/i, "200w.mp4");
  }
  return previewUrl;
}

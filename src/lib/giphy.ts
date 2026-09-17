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

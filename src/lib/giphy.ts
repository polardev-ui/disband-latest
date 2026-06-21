export interface GiphyImage {
  id: string;
  title?: string;
  /** Full-size animated GIF URL */
  url?: string;
  /** Small preview for the picker grid */
  preview?: string;
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

const GIPHY_SEARCH = "https://api.wsgpolar.me/v1/giphy/search";

export async function searchGifs(query: string, limit = 20): Promise<GiphyImage[]> {
  const q = encodeURIComponent(query.trim() || "funny");
  const res = await fetch(`${GIPHY_SEARCH}?q=${q}&limit=${limit}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body || `Failed to load GIFs (${res.status})`);
  }
  const json = (await res.json()) as GiphySearchResponse;
  return json.results ?? json.data ?? [];
}

/** URL for sending in chat (full GIF) */
export function gifUrl(gif: GiphyImage): string | null {
  return (
    gif.url
    ?? gif.images?.original?.url
    ?? gif.images?.fixed_width?.url
    ?? gif.preview
    ?? null
  );
}

/** Smaller URL for the picker thumbnail grid */
export function gifPreviewUrl(gif: GiphyImage): string | null {
  return gif.preview ?? gif.images?.fixed_width?.url ?? gifUrl(gif);
}

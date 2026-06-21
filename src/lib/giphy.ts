export interface GiphyImage {
  id: string;
  url?: string;
  images?: {
    fixed_width?: { url?: string };
    original?: { url?: string };
  };
}

export async function searchGifs(query: string, limit = 20): Promise<GiphyImage[]> {
  const q = encodeURIComponent(query.trim() || "trending");
  const res = await fetch(`https://api.wsgpolar.me/v1/giphy/search?q=${q}&limit=${limit}`);
  if (!res.ok) throw new Error("Failed to load GIFs");
  const json = (await res.json()) as { data?: GiphyImage[] };
  return json.data ?? [];
}

export function gifUrl(gif: GiphyImage): string | null {
  return gif.images?.fixed_width?.url ?? gif.images?.original?.url ?? gif.url ?? null;
}

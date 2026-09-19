import { PUBLIC_ENV } from "@/lib/public-env";
import { isTauri } from "@/lib/platform";
import { extractInviteCodes } from "@/lib/utils";

export interface LinkPreview {
  url: string;
  title: string;
  description?: string;
  image?: string;
}

const URL_RE = /https?:\/\/[^\s<>\[\]()]+[^\s<>\[\]().,;:!?'"`]/gi;
const INVITE_IN_URL_RE = /\/server\/[a-zA-Z0-9]{7}\b/;

const GIFT_IN_URL_RE = /\/gift\/[a-zA-Z0-9]{10}\b/;

const cache = new Map<string, LinkPreview | null>();
const inflight = new Map<string, Promise<LinkPreview | null>>();
const CACHE_MAX = 200;

function cachePreview(url: string, preview: LinkPreview | null): void {
  cache.delete(url);
  cache.set(url, preview);
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export function extractPreviewUrls(text: string, max = 3): string[] {
  const inviteCodes = new Set(extractInviteCodes(text));
  const urls: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(URL_RE.source, "gi");
  while ((match = re.exec(text)) !== null) {
    const url = match[0];
    if (seen.has(url)) continue;
    if (GIFT_IN_URL_RE.test(url)) continue;
    if (INVITE_IN_URL_RE.test(url)) {
      const code = url.match(/\/server\/([a-zA-Z0-9]{7})\b/)?.[1];
      if (code && inviteCodes.has(code)) continue;
    }
    seen.add(url);
    urls.push(url);
    if (urls.length >= max) break;
  }
  return urls;
}

function previewEndpoints(): string[] {
  if (isTauri()) {
    return [
      `${PUBLIC_ENV.mediaApiUrl}/link/preview`,
      `${PUBLIC_ENV.webAppUrl}/api/link/preview`,
    ];
  }
  return ["/api/link/preview", `${PUBLIC_ENV.mediaApiUrl}/link/preview`];
}

function parsePreviewPayload(url: string, data: {
  title?: string;
  description?: string;
  image?: string;
}): LinkPreview {
  let hostname = url;
  try {
    hostname = new URL(url).hostname;
  } catch {

  }
  return {
    url,
    title: data.title?.trim() || hostname,
    description: data.description?.trim() || undefined,
    image: data.image?.trim() || undefined,
  };
}

async function fetchFromEndpoint(base: string, url: string): Promise<LinkPreview | null> {
  const endpoint =
    base.startsWith("http") || base.startsWith("/")
      ? `${base}${base.includes("?") ? "&" : "?"}url=${encodeURIComponent(url)}`
      : `${base}?url=${encodeURIComponent(url)}`;

  const res = await fetch(endpoint);
  if (!res.ok) return null;
  const data = (await res.json()) as { title?: string; description?: string; image?: string };
  return parsePreviewPayload(url, data);
}

export async function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
  if (cache.has(url)) return cache.get(url) ?? null;
  const pending = inflight.get(url);
  if (pending) return pending;

  const promise = (async () => {
    try {
      for (const base of previewEndpoints()) {
        try {
          const preview = await fetchFromEndpoint(base, url);
          if (preview) {
            cachePreview(url, preview);
            return preview;
          }
        } catch {

        }
      }
      cachePreview(url, null);
      return null;
    } finally {
      inflight.delete(url);
    }
  })();

  inflight.set(url, promise);
  return promise;
}

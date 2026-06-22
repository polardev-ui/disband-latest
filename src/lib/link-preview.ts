import { PUBLIC_ENV } from "@/lib/public-env";
import { extractInviteCodes } from "@/lib/utils";

export interface LinkPreview {
  url: string;
  title: string;
  description?: string;
  image?: string;
}

const URL_RE = /https?:\/\/[^\s<>\[\]()]+[^\s<>\[\]().,;:!?'"`]/gi;
const INVITE_IN_URL_RE = /\/server\/[a-zA-Z0-9]{7}\b/;

const cache = new Map<string, LinkPreview | null>();
const inflight = new Map<string, Promise<LinkPreview | null>>();

export function extractPreviewUrls(text: string, max = 3): string[] {
  const inviteCodes = new Set(extractInviteCodes(text));
  const urls: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(URL_RE.source, "gi");
  while ((match = re.exec(text)) !== null) {
    const url = match[0];
    if (seen.has(url)) continue;
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

export async function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
  if (cache.has(url)) return cache.get(url) ?? null;
  const pending = inflight.get(url);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const res = await fetch(
        `${PUBLIC_ENV.mediaApiUrl}/link/preview?url=${encodeURIComponent(url)}`,
      );
      if (!res.ok) {
        cache.set(url, null);
        return null;
      }
      const data = (await res.json()) as { title?: string; description?: string; image?: string };
      const preview: LinkPreview = {
        url,
        title: data.title?.trim() || new URL(url).hostname,
        description: data.description?.trim() || undefined,
        image: data.image?.trim() || undefined,
      };
      cache.set(url, preview);
      return preview;
    } catch {
      cache.set(url, null);
      return null;
    } finally {
      inflight.delete(url);
    }
  })();

  inflight.set(url, promise);
  return promise;
}

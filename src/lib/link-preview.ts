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

/**
 * Remove the given URLs from display text.
 *
 * A GIF link is rendered as the GIF itself (see `GifLinkEmbed`), so leaving
 * the raw URL in the body would print the link twice — once as text and once
 * as the image. Both spellings a message can take are handled: the bare URL,
 * and a `[label](url)` node, where a meaningful label survives as plain text
 * and a label that is just the URL again disappears with it.
 */
export function removeUrlsFromText(text: string, urls: string[]): string {
  let out = text;
  for (const url of urls) {
    if (!url) continue;
    const esc = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Markdown-style [label](url): keep a meaningful label, drop the node.
    out = out.replace(new RegExp(`\\[([^\\n\\]]*)\\]\\(${esc}\\)`, "g"), (_m, label: string) =>
      label.trim() && label.trim() !== url ? label.trim() : "",
    );
    // A URL sitting alone on its line takes the line — and its line break —
    // with it, so "look\n<gif>\ntext" does not become "look\n\ntext".
    out = out.replace(new RegExp(`(^|\\n)[ \\t]*${esc}[ \\t]*(?=\\n|$)`, "g"), "");
    // Anything left was inline in a sentence: remove it in place.
    out = out.replace(new RegExp(esc, "g"), "");
  }
  // Close the gaps the removals leave, without rejoining split lines.
  return out.replace(/[ \t]{2,}/g, " ").replace(/\n[ \t]+\n/g, "\n\n").trim();
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
            cache.set(url, preview);
            return preview;
          }
        } catch {

        }
      }
      cache.set(url, null);
      return null;
    } finally {
      inflight.delete(url);
    }
  })();

  inflight.set(url, promise);
  return promise;
}

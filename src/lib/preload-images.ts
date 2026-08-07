import { safeImageUrl } from "@/lib/safe-url";

interface PreloadOptions {
  /** Give up waiting after this long and let the app render regardless. */
  timeoutMs?: number;
  /** Upper bound on requests, so a large account can't stall startup. */
  max?: number;
}

/**
 * Warm the browser cache for a set of image URLs.
 *
 * Avatars render through a plain `<img src={safeImageUrl(...)}>`, so fetching
 * the identical URL here means the real element paints from cache instead of
 * popping in a moment later.
 *
 * Never rejects: a broken or slow avatar must not be able to hold the app
 * hostage, so failures resolve and the whole batch is capped by a timeout.
 */
export function preloadImages(
  urls: (string | null | undefined)[],
  { timeoutMs = 5000, max = 80 }: PreloadOptions = {},
): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();

  const unique = [...new Set(urls.map((u) => safeImageUrl(u)).filter((u): u is string => !!u))].slice(
    0,
    max,
  );
  if (unique.length === 0) return Promise.resolve();

  const loadOne = (src: string) =>
    new Promise<void>((resolve) => {
      const img = new Image();
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      img.onload = done;
      img.onerror = done;
      img.src = src;
      // decode() resolves once the bitmap is ready to paint, not merely fetched.
      void img.decode?.().then(done).catch(done);
    });

  return Promise.race([
    Promise.all(unique.map(loadOne)).then(() => undefined),
    new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs)),
  ]);
}

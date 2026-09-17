import { safeImageUrl } from "@/lib/safe-url";

interface PreloadOptions {

  timeoutMs?: number;

  max?: number;
}

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

      void img.decode?.().then(done).catch(done);
    });

  return Promise.race([
    Promise.all(unique.map(loadOne)).then(() => undefined),
    new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs)),
  ]);
}

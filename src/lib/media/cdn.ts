import { PUBLIC_ENV } from "@/lib/public-env";

const LEGACY_HOSTS = [
  "https://api.wsgpolar.me/v1/images/",
  "http://api.wsgpolar.me/v1/images/",
];

/** `https://cdn.disband.dev/v1` -> `https://cdn.disband.dev/v1/images/` */
const CDN_IMAGES = `${PUBLIC_ENV.cdnUrl.replace(/\/$/, "")}/images/`;

/**
 * Serves any stored image from the CDN.
 *
 * Rows were rewritten in the database, but a URL can reach the app from
 * plenty of places that migration never touched — a message loaded from a
 * client's own cache, an older mobile build that uploaded to the previous
 * host, a link someone pasted. Rewriting at the point of rendering means
 * every image comes from the CDN regardless of which of those it came from,
 * and it costs one string comparison.
 *
 * Anything that is not one of ours is returned untouched: Giphy, link-preview
 * thumbnails and avatars hosted elsewhere must keep their own hosts.
 */
export function cdnImage<T extends string | null | undefined>(url: T): T {
  if (!url) return url;
  for (const legacy of LEGACY_HOSTS) {
    if (url.startsWith(legacy)) {
      return (CDN_IMAGES + url.slice(legacy.length)) as T;
    }
  }
  return url;
}

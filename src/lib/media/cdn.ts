import { PUBLIC_ENV } from "@/lib/public-env";

const LEGACY_HOSTS = [
  "https://api.wsgpolar.me/v1/images/",
  "http://api.wsgpolar.me/v1/images/",
];

const CDN_IMAGES = `${PUBLIC_ENV.cdnUrl.replace(/\/$/, "")}/images/`;

export function cdnImage<T extends string | null | undefined>(url: T): T {
  if (!url) return url;
  for (const legacy of LEGACY_HOSTS) {
    if (url.startsWith(legacy)) {
      return (CDN_IMAGES + url.slice(legacy.length)) as T;
    }
  }
  return url;
}

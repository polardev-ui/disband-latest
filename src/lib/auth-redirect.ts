import { PUBLIC_ENV } from "@/lib/public-env";

export function getAuthRedirectUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const webApp = PUBLIC_ENV.webAppUrl.replace(/\/$/, "");

  if (typeof window === "undefined") return `${webApp}${normalized}`;

  const origin = window.location.origin;
  if (!/^https?:\/\//i.test(origin)) return `${webApp}${normalized}`;
  return `${origin}${normalized}`;
}

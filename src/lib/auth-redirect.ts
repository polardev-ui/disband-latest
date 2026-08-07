import { PUBLIC_ENV } from "@/lib/public-env";

/**
 * Build an absolute redirect URL for Supabase auth emails.
 *
 * The current origin is used when it is a real web origin, so local dev and
 * preview deployments land back on themselves. Tauri serves the desktop app
 * from `tauri://localhost`, which cannot appear in an email link — those fall
 * back to the canonical web app, matching how invite links are built.
 *
 * Whatever this returns must be present in the Supabase dashboard under
 * Authentication → URL Configuration → Redirect URLs, or GoTrue silently
 * rewrites the link to the project's Site URL.
 */
export function getAuthRedirectUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const webApp = PUBLIC_ENV.webAppUrl.replace(/\/$/, "");

  if (typeof window === "undefined") return `${webApp}${normalized}`;

  const origin = window.location.origin;
  if (!/^https?:\/\//i.test(origin)) return `${webApp}${normalized}`;
  return `${origin}${normalized}`;
}

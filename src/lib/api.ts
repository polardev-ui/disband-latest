"use client";

import { isTauri } from "@/lib/platform";
import { PUBLIC_ENV } from "@/lib/public-env";
import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * Calling a Next.js API route from the client.
 *
 * The desktop app is a static export (`output: export`) served from
 * `tauri://localhost`, so it ships no API routes at all. A relative
 * `fetch("/api/…")` there resolves to the static HTML shell, and the
 * `res.json()` that follows throws WebKit's "The string did not match the
 * expected pattern" — which is how this surfaced: an unhandled rejection with
 * no useful message when a desktop user pressed Upgrade.
 *
 * So desktop has to call the hosted origin. That in turn means the request is
 * cross-origin, and the Supabase auth cookies the routes read do NOT travel
 * with it — the URL fix alone would only turn the SyntaxError into a 401.
 * `apiFetch` therefore also attaches the session as a bearer token, which
 * `getRouteUser()` on the server accepts alongside cookies.
 */
export function apiUrl(path: string): string {
  if (!path.startsWith("/")) path = `/${path}`;
  if (!isTauri()) return path;
  return `${PUBLIC_ENV.webAppUrl.replace(/\/$/, "")}${path}`;
}

/**
 * `fetch` for our own API routes: absolute on desktop, relative on web, with
 * the access token attached so cookie-less (cross-origin) callers still
 * authenticate.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);

  // Always attached, on web as well as desktop. The browser client stores the
  // session in localStorage and deliberately clears every `sb-*` cookie on
  // startup (see `createBrowserSupabaseClient`), so a cookie-reading route has
  // nothing to read and answers 401 for everyone — which is what "Manage
  // billing" was hitting. The bearer token is the only credential that exists.
  if (!headers.has("Authorization")) {
    try {
      const { data } = await getSupabaseClient().auth.getSession();
      const token = data.session?.access_token;
      if (token) headers.set("Authorization", `Bearer ${token}`);
    } catch {
      // No session: let the route return its own 401.
    }
  }

  return fetch(apiUrl(path), { ...init, headers });
}

/**
 * `apiFetch` + JSON parse that cannot throw on an HTML error page. Returns
 * `{ error }` instead, so a caller never sees a raw SyntaxError.
 */
export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T | { error: string }> {
  let res: Response;
  try {
    res = await apiFetch(path, init);
  } catch {
    return { error: "Couldn't reach the server. Check your connection and try again." };
  }

  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return {
      error: res.ok
        ? "The server returned an unexpected response."
        : `Request failed (${res.status}).`,
    };
  }
}

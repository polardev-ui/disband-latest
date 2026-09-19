"use client";

import { isTauri } from "@/lib/platform";
import { PUBLIC_ENV } from "@/lib/public-env";
import { getSupabaseClient } from "@/lib/supabase/client";

export function apiUrl(path: string): string {
  if (!path.startsWith("/")) path = `/${path}`;
  if (!isTauri()) return path;
  return `${PUBLIC_ENV.webAppUrl.replace(/\/$/, "")}${path}`;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = apiUrl(path);
  const expectedOrigin = isTauri() ? new URL(PUBLIC_ENV.webAppUrl).origin : window.location.origin;
  if (new URL(url, window.location.href).origin !== expectedOrigin) {
    throw new Error("API requests must stay on the configured Disband origin");
  }
  const headers = new Headers(init.headers);

  if (!headers.has("Authorization")) {
    try {
      const { data } = await getSupabaseClient().auth.getSession();
      const token = data.session?.access_token;
      if (token) headers.set("Authorization", `Bearer ${token}`);
    } catch {

    }
  }

  return fetch(url, { ...init, headers });
}

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

"use client";

import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * fetch() that attaches the current user's JWT as a Bearer token, so browser
 * calls to our API routes can use getUserFromRequest() for auth.
 */
export async function authFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const { data } = await getSupabaseClient().auth.getSession();
  const token = data?.session?.access_token;
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(input, { ...init, headers });
}

"use client";

import { createBrowserClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PUBLIC_ENV } from "@/lib/public-env";
import { isTauri } from "@/lib/platform";

let browserClient: SupabaseClient | null = null;

function clearSupabaseAuthCookies() {
  if (typeof document === "undefined") return;
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0]?.trim();
    if (name?.startsWith("sb-")) {
      document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
    }
  }
}

function createTauriClient(url: string, anonKey: string): SupabaseClient {
  clearSupabaseAuthCookies();
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: window.localStorage,
    },
  });
}

export function resetSupabaseClient() {
  browserClient = null;
}

export function getSupabaseClient(): SupabaseClient {
  if (browserClient) return browserClient;

  const url = PUBLIC_ENV.supabaseUrl;
  const anonKey = PUBLIC_ENV.supabaseAnonKey;

  if (!url || !anonKey) {
    throw new Error("Missing Supabase configuration.");
  }

  browserClient =
    typeof window !== "undefined" && isTauri()
      ? createTauriClient(url, anonKey)
      : createBrowserClient(url, anonKey);

  return browserClient;
}

/** True when Supabase env vars are present — lets the UI degrade gracefully. */
export function isSupabaseConfigured(): boolean {
  return Boolean(PUBLIC_ENV.supabaseUrl && PUBLIC_ENV.supabaseAnonKey);
}

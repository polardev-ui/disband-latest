"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PUBLIC_ENV } from "@/lib/public-env";

let browserClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (browserClient) return browserClient;

  const url = PUBLIC_ENV.supabaseUrl;
  const anonKey = PUBLIC_ENV.supabaseAnonKey;

  if (!url || !anonKey) {
    throw new Error("Missing Supabase configuration.");
  }

  browserClient = createBrowserClient(url, anonKey);
  return browserClient;
}

/** True when Supabase env vars are present — lets the UI degrade gracefully. */
export function isSupabaseConfigured(): boolean {
  return Boolean(PUBLIC_ENV.supabaseUrl && PUBLIC_ENV.supabaseAnonKey);
}

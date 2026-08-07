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

const JWT_EXPIRED_PATTERN = /JWT expired|PGRST303|Invalid JWT/i;

function isJwtExpiredError(error: { code?: string; message?: string } | null | undefined): boolean {
  return Boolean(
    error &&
      (error.code === "PGRST303" ||
        (typeof error.message === "string" && JWT_EXPIRED_PATTERN.test(error.message))),
  );
}

/**
 * Wraps a Postgrest builder so that a single "JWT expired" (or PGRST303)
 * response refreshes the session once and transparently re-runs the same
 * query, instead of surfacing the error to the caller. A 401 means the
 * server rejected the request before executing it, so retrying a read (or a
 * failed write) is safe. Each terminal `await`/`.then` on a wrapped builder
 * retries at most once.
 */
function wrapQueryBuilder(builder: object): unknown {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      if (prop === "then") {
        return (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason?: unknown) => unknown) => {
          const run = () =>
            (target as { then: (cb: (value: unknown) => unknown) => Promise<unknown> }).then((res) => res);
          return (async () => {
            const first = await run();
            const error = (first as { error?: { code?: string; message?: string } | null })?.error;
            if (!isJwtExpiredError(error)) return first;
            const supabase = getSupabaseClient();
            const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
            if (refreshError || !refreshed.session) return first;
            return run();
          })().then(onFulfilled, onRejected);
        };
      }
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === "function") {
        return (...args: unknown[]) => wrapQueryBuilder(value.apply(target, args));
      }
      return value;
    },
  });
}

/**
 * Global safety net: every `.from(...)` / `.rpc(...)` query automatically
 * refreshes the session and retries once when the server reports the access
 * token as expired. This keeps data fetches from silently 401ing (or the
 * desktop app showing "JWT expired" errors) after the token lapses while the
 * app was closed or suspended.
 */
function wrapSupabaseClient(client: SupabaseClient): SupabaseClient {
  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop === "from" || prop === "rpc") {
        return (...args: unknown[]) => wrapQueryBuilder(value.apply(target, args));
      }
      return value;
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

  const raw =
    typeof window !== "undefined" && isTauri()
      ? createTauriClient(url, anonKey)
      : createBrowserClient(url, anonKey);

  browserClient = wrapSupabaseClient(raw);

  return browserClient;
}

/** True when Supabase env vars are present — lets the UI degrade gracefully. */
export function isSupabaseConfigured(): boolean {
  return Boolean(PUBLIC_ENV.supabaseUrl && PUBLIC_ENV.supabaseAnonKey);
}

/**
 * True when the session's access token is already expired (or within a small
 * safety buffer). supabase-js only auto-refreshes while a token is still inside
 * its expiry margin, so an already-dead token can otherwise leave every
 * request 401ing with "JWT expired" forever.
 */
export function isAccessTokenExpired(session: { expires_at?: number | null } | null | undefined): boolean {
  return Boolean(session && typeof session.expires_at === "number" && session.expires_at * 1000 <= Date.now() + 30_000);
}

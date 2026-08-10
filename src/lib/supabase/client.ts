"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PUBLIC_ENV } from "@/lib/public-env";

let browserClient: SupabaseClient | null = null;

// Refresh deduplication: only one refresh in flight at a time, and at most
// once every 10 seconds. Prevents a storm when multiple queries all hit
// JWT-expired at once (e.g. on app boot), each triggering its own refresh.
//
// The cooldown and the serialization are shared across tabs:
//  - The cooldown timestamp lives in localStorage, so N tabs together still
//    refresh at most ~6×/minute instead of N× that. Exceeding Supabase's
//    per-IP refresh rate limit (1800/hr) trips 429s that cascade into
//    sign-outs.
//  - Refresh calls are serialized through the Web Locks API so two tabs can
//    never use the same (single-use, rotating) refresh token concurrently —
//    a race that GoTrue's reuse detection punishes by revoking the session.
type RefreshResult = { session: unknown } | { error: unknown };
let refreshPromise: Promise<RefreshResult> | null = null;
let lastRefreshTime = 0;
const REFRESH_COOLDOWN_MS = 10_000;
const REFRESH_COOLDOWN_KEY = "disband-supabase-refresh-cooldown";
const REFRESH_LOCK_NAME = "disband-supabase-auth-refresh";
const REFRESH_LOCK_KEY = "disband-supabase-auth-refresh-lock";
const REFRESH_LOCK_TTL_MS = 15_000;

function readSharedCooldown(): number {
  try {
    const raw = window.localStorage.getItem(REFRESH_COOLDOWN_KEY);
    const ts = raw ? Number(raw) : 0;
    return Number.isFinite(ts) ? ts : 0;
  } catch {
    return lastRefreshTime;
  }
}

function writeSharedCooldown() {
  lastRefreshTime = Date.now();
  try {
    window.localStorage.setItem(REFRESH_COOLDOWN_KEY, String(lastRefreshTime));
  } catch {
    // storage unavailable — the in-tab value still throttles this tab
  }
}

/**
 * Runs `task` while holding a cross-tab exclusive lock, so that concurrent
 * refresh attempts from multiple tabs are serialized. Uses the Web Locks API
 * where available (Safari 15.4+), falling back to a localStorage mutex with a
 * TTL so a crashed tab cannot wedge it.
 */
async function acquireRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  const locks =
    typeof navigator !== "undefined" && "locks" in navigator
      ? (navigator as { locks: { request: (name: string, cb: () => Promise<T>) => Promise<T> } }).locks
      : undefined;
  if (locks?.request) {
    try {
      return await locks.request(REFRESH_LOCK_NAME, task);
    } catch {
      // Lock manager error (rare) — fall through to the storage mutex.
    }
  }
  const stamp = Date.now();
  const token = `${stamp}-${Math.random()}`;
  const deadline = stamp + REFRESH_LOCK_TTL_MS;
  const mine = () => {
    try {
      return window.localStorage.getItem(REFRESH_LOCK_KEY) === `${stamp}|${token}`;
    } catch {
      return true;
    }
  };
  while (Date.now() < deadline) {
    try {
      const held = window.localStorage.getItem(REFRESH_LOCK_KEY);
      if (!held || Number(held.split("|")[0]) < Date.now() - REFRESH_LOCK_TTL_MS) {
        window.localStorage.setItem(REFRESH_LOCK_KEY, `${stamp}|${token}`);
        if (mine()) {
          try {
            return await task();
          } finally {
            if (mine()) window.localStorage.removeItem(REFRESH_LOCK_KEY);
          }
        }
      }
    } catch {
      // storage unavailable — fall through and run without the lock
      return task();
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return task();
}

export async function refreshSessionOnce(): Promise<RefreshResult> {
  if (refreshPromise) {
    return refreshPromise;
  }
  if (Date.now() - readSharedCooldown() < REFRESH_COOLDOWN_MS) {
    return { error: new Error("refresh cooldown") };
  }
  refreshPromise = acquireRefreshLock(async () => {
    // Another tab may have refreshed while we waited for the lock.
    if (Date.now() - readSharedCooldown() < REFRESH_COOLDOWN_MS) {
      return { error: new Error("refresh cooldown") };
    }
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.refreshSession();
    if (error) return { error };
    writeSharedCooldown();
    return { session: data.session };
  });
  try {
    return await refreshPromise;
  } catch (error) {
    return { error };
  } finally {
    refreshPromise = null;
  }
}

function createBrowserSupabaseClient(url: string, anonKey: string): SupabaseClient {
  if (typeof document !== "undefined") {
    for (const cookie of document.cookie.split(";")) {
      const name = cookie.split("=")[0]?.trim();
      if (name?.startsWith("sb-")) {
        document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
      }
    }
  }
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
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
            const result = await refreshSessionOnce();
            if ("error" in result) return first;
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
  refreshPromise = null;
  lastRefreshTime = 0;
}

export function getSupabaseClient(): SupabaseClient {
  if (browserClient) return browserClient;

  const url = PUBLIC_ENV.supabaseUrl;
  const anonKey = PUBLIC_ENV.supabaseAnonKey;

  if (!url || !anonKey) {
    throw new Error("Missing Supabase configuration.");
  }

  const raw = createBrowserSupabaseClient(url, anonKey);
  browserClient = wrapSupabaseClient(raw);
  return browserClient;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(PUBLIC_ENV.supabaseUrl && PUBLIC_ENV.supabaseAnonKey);
}

export function isAccessTokenExpired(session: { expires_at?: number | null } | null | undefined): boolean {
  return Boolean(session && typeof session.expires_at === "number" && session.expires_at * 1000 <= Date.now() + 30_000);
}

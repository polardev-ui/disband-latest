"use client";

import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { PUBLIC_ENV } from "@/lib/public-env";
import { saveSwitchRefreshToken } from "@/lib/switch-refresh-tokens";

let browserClient: SupabaseClient | null = null;

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

  }
}

async function acquireRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  const locks =
    typeof navigator !== "undefined" && "locks" in navigator
      ? (navigator as { locks: { request: (name: string, cb: () => Promise<T>) => Promise<T> } }).locks
      : undefined;
  if (locks?.request) {
    try {
      return await locks.request(REFRESH_LOCK_NAME, task);
    } catch {

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
  const client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      experimental: { passkey: true },
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
    },
  });
  /*
   Keep each account's saved refresh token current, whoever caused the refresh.

   Refresh tokens are single-use: every refresh retires the old one. The copy
   used for account switching used to be updated only from React state, which
   misses refreshes made outside it (the expired-JWT retry below, a refresh in
   another tab). Switching back then presented a retired token — and Supabase
   treats reuse of a retired token as theft and revokes that whole sign-in,
   which is why the account had to be removed and added again. Listening here,
   on the client itself, sees every rotation.
  */
  client.auth.onAuthStateChange((_event, session) => {
    if (session?.user?.id && session.refresh_token) {
      saveSwitchRefreshToken(session.user.id, session.refresh_token);
    }
  });
  return client;
}

export type TokenExchange =
  | { session: Session }
  | { error: string; expired: boolean };

/**
 * Trade a saved refresh token for a fresh session WITHOUT touching the active
 * one.
 *
 * Doing this on the main client was the other half of the switching bug: when
 * the token was no longer valid, auth-js cleared the *current* session from
 * storage as a side effect, and the app then restored it from a React copy that
 * could itself be stale. A throwaway, memory-only client keeps a failed switch
 * completely side-effect free; only a session that is known to be good is ever
 * handed to the main client.
 */
export async function exchangeRefreshToken(refreshToken: string): Promise<TokenExchange> {
  const url = PUBLIC_ENV.supabaseUrl;
  const anonKey = PUBLIC_ENV.supabaseAnonKey;
  if (!url || !anonKey) return { error: "Missing Supabase configuration.", expired: false };
  const probe = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `disband-switch-probe-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
  });
  let lastError = "Could not reach Disband.";
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await probe.auth.refreshSession({ refresh_token: refreshToken });
    if (!error && data.session) return { session: data.session };
    lastError = error?.message ?? lastError;
    // Only network trouble is worth retrying; a rejected token stays rejected.
    if (error?.name !== "AuthRetryableFetchError") return { error: lastError, expired: true };
    await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
  }
  return { error: lastError, expired: false };
}

/** Forget in-flight refresh bookkeeping (after the active account changes). */
export function resetRefreshState() {
  refreshPromise = null;
  lastRefreshTime = 0;
  try {
    window.localStorage.removeItem(REFRESH_COOLDOWN_KEY);
  } catch {

  }
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

/**
 * A memory-only client for passkey ceremonies. Keeping the passkey sign-in
 * off the main client means a cancelled prompt, or a passkey for the wrong
 * account, cannot disturb the password session the user already has.
 */
export function createPasskeyProbeClient(): SupabaseClient | null {
  const url = PUBLIC_ENV.supabaseUrl;
  const anonKey = PUBLIC_ENV.supabaseAnonKey;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      experimental: { passkey: true },
      storageKey: `disband-passkey-probe-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
  });
}

export function isSupabaseConfigured(): boolean {
  return Boolean(PUBLIC_ENV.supabaseUrl && PUBLIC_ENV.supabaseAnonKey);
}

export function isAccessTokenExpired(session: { expires_at?: number | null } | null | undefined): boolean {
  return Boolean(session && typeof session.expires_at === "number" && session.expires_at * 1000 <= Date.now() + 30_000);
}

"use client";

/*
 Keeps the server's network-restriction marker on this device (see
 network-restriction.server.ts) and hands it back with every sign-in and
 sign-up attempt.

 It's kept in several places at once, under names that don't say what they
 are: localStorage, IndexedDB, a cookie and Cache Storage. Clearing one (or
 "clear site data" for one kind of storage) leaves the others, and whichever
 survives is copied back to the rest the next time this runs. The marker is
 signed by the server and only says "restricted until <time>", so nothing
 here can be edited to lift or extend it.

 Every store is best-effort: private windows, blocked storage and the like
 just mean fewer copies.
*/

// Deliberately unremarkable names.
const LS_KEY = "_dsb_rk7Qx2";
const COOKIE = "_dsb_vq3";
const IDB_NAME = "dsb-kv-cache";
const IDB_STORE = "kv";
const CACHE_NAME = "dsb-assets-v3";
const CACHE_URL = "/__dsb_cache/v3/manifest";

function decodeUntil(token: string): number {
  try {
    const body = token.split(".")[0] ?? "";
    const json = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/"))) as { u?: number };
    return typeof json.u === "number" ? json.u : 0;
  } catch {
    return 0;
  }
}

function idb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbGet(): Promise<string | null> {
  const db = await idb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get("v");
      req.onsuccess = () => resolve(typeof req.result === "string" ? req.result : null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbSet(value: string | null): Promise<void> {
  const db = await idb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const store = db.transaction(IDB_STORE, "readwrite").objectStore(IDB_STORE);
      const req = value ? store.put(value, "v") : store.delete("v");
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function cacheGet(): Promise<string | null> {
  try {
    if (!("caches" in window)) return null;
    const cache = await caches.open(CACHE_NAME);
    const res = await cache.match(CACHE_URL);
    return res ? await res.text() : null;
  } catch {
    return null;
  }
}

async function cacheSet(value: string | null): Promise<void> {
  try {
    if (!("caches" in window)) return;
    const cache = await caches.open(CACHE_NAME);
    if (value) await cache.put(CACHE_URL, new Response(value));
    else await cache.delete(CACHE_URL);
  } catch {
    // Best-effort.
  }
}

function cookieGet(): string | null {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=([^;]*)`));
    return m ? decodeURIComponent(m[1]!) : null;
  } catch {
    return null;
  }
}

function cookieSet(value: string | null, until: number) {
  try {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = value
      ? `${COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${Math.max(1, Math.ceil((until - Date.now()) / 1000))}; SameSite=Lax${secure}`
      : `${COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
  } catch {
    // Best-effort.
  }
}

function lsGet(): string | null {
  try {
    return localStorage.getItem(LS_KEY);
  } catch {
    return null;
  }
}

function lsSet(value: string | null) {
  try {
    if (value) localStorage.setItem(LS_KEY, value);
    else localStorage.removeItem(LS_KEY);
  } catch {
    // Best-effort.
  }
}

async function writeAll(token: string | null) {
  const until = token ? decodeUntil(token) : 0;
  lsSet(token);
  cookieSet(token, until);
  await Promise.all([idbSet(token), cacheSet(token)]);
}

/**
 * The marker this device holds, if one is still running. Restores it to any
 * store that lost it; forgets it everywhere once it has run out.
 */
export async function readRestriction(): Promise<{ token: string; until: Date } | null> {
  if (typeof window === "undefined") return null;
  const found = [lsGet(), cookieGet(), await idbGet(), await cacheGet()].filter((v): v is string => !!v);
  let best: string | null = null;
  for (const token of found) if (!best || decodeUntil(token) > decodeUntil(best)) best = token;
  if (!best || decodeUntil(best) <= Date.now()) {
    if (found.length) await writeAll(null);
    return null;
  }
  // Put it back wherever it went missing.
  if (found.length < 4 || found.some((t) => t !== best)) await writeAll(best);
  return { token: best, until: new Date(decodeUntil(best)) };
}

/** Keep a marker from a server answer (no-op when the answer has none). */
export async function rememberRestriction(json: unknown): Promise<void> {
  const token = (json as { restriction?: unknown } | null)?.restriction;
  if (typeof token !== "string" || !token.includes(".")) return;
  const current = await readRestriction();
  if (current && decodeUntil(current.token) >= decodeUntil(token)) return;
  await writeAll(token);
}

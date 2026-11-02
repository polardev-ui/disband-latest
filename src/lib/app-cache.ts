import { CACHE_PREFIX, pruneCaches, setItemWithRoom } from "@/lib/local-storage";

const CACHE_TTL = 5 * 60 * 1000;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

function store(): Map<string, CacheEntry<unknown>> {
  const key = "__disband_cache_store__";
  const g = globalThis as unknown as Record<string, unknown>;
  if (!(key in g)) {
    g[key] = new Map();
  }
  return g[key] as Map<string, CacheEntry<unknown>>;
}

let pruned = false;

function persist(key: string, data: unknown): void {
  try {
    // Entries are only read back for their own key, so ones for spaces
    // that are never opened again would sit there for good. Clear out the
    // expired ones once a session.
    if (!pruned) {
      pruned = true;
      pruneCaches(true);
    }
    const raw = JSON.stringify(data);
    const bytes = new TextEncoder().encode(raw);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    setItemWithRoom(CACHE_PREFIX + key, btoa(binary));
  } catch {

  }
}

function loadPersisted(key: string): unknown | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const binary = atob(raw);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    localStorage.removeItem(CACHE_PREFIX + key);
    return null;
  }
}

export function getCached<T>(key: string): T | null {
  const mem = store().get(key) as CacheEntry<T> | undefined;
  if (mem && Date.now() < mem.expiresAt) return mem.data;

  const persisted = loadPersisted(key);
  if (persisted) {
    const entry = persisted as CacheEntry<T>;
    if (Date.now() < entry.expiresAt) {
      store().set(key, entry);
      return entry.data;
    }
  }
  return null;
}

export function setCache<T>(key: string, data: T, ttl = CACHE_TTL, opts?: { persist?: boolean }): void {
  const entry: CacheEntry<T> = { data, expiresAt: Date.now() + ttl };
  store().set(key, entry);
  // Big payloads (the full member list of a large server) stay in memory:
  // persisting megabytes of JSON through base64 on every write janks the
  // main thread and usually blows the localStorage quota anyway.
  if (opts?.persist === false) return;
  persist(key, entry);
}

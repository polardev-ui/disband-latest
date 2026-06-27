const CACHE_PREFIX = "disband:cache:";
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

function persist(key: string, data: unknown): void {
  try {
    const raw = JSON.stringify(data);
    localStorage.setItem(CACHE_PREFIX + key, btoa(raw));
  } catch {
    /* storage full — ignore */
  }
}

function loadPersisted(key: string): unknown | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(atob(raw));
  } catch {
    localStorage.removeItem(CACHE_PREFIX + key);
    return null;
  }
}

export function getCached<T>(key: string): T | null {
  const mem = store().get(key) as CacheEntry<T> | undefined;
  if (mem && Date.now() < mem.expiresAt) return mem.data;

  // fallback to persisted cache
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

export function setCache<T>(key: string, data: T, ttl = CACHE_TTL): void {
  const entry: CacheEntry<T> = { data, expiresAt: Date.now() + ttl };
  store().set(key, entry);
  persist(key, entry);
}

export function clearCache(): void {
  store().clear();
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.getItem(localStorage.key(i)!);
    if (k?.startsWith(CACHE_PREFIX)) localStorage.removeItem(localStorage.key(i)!);
  }
}

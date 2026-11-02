/**
 * localStorage writes that make room instead of throwing.
 *
 * The origin gets about 5 MB. Cached space data (disband:cache:*) used to
 * pile up there for every space ever opened, and once it was full the next
 * plain setItem threw QuotaExceededError mid-render and took the whole app
 * down. Everything under disband:cache: can be fetched again, so it is the
 * first thing to go when space runs out.
 */

export const CACHE_PREFIX = "disband:cache:";

/** Remove cache entries. With onlyExpired, keep the ones still in date. */
export function pruneCaches(onlyExpired: boolean): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(CACHE_PREFIX)) keys.push(key);
    }
    const now = Date.now();
    for (const key of keys) {
      if (onlyExpired && !isExpired(localStorage.getItem(key), now)) continue;
      localStorage.removeItem(key);
    }
  } catch {
    // Storage blocked: nothing to prune.
  }
}

function isExpired(raw: string | null, now: number): boolean {
  if (!raw) return true;
  try {
    const binary = atob(raw);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const entry = JSON.parse(new TextDecoder().decode(bytes)) as { expiresAt?: number };
    return !(typeof entry.expiresAt === "number" && entry.expiresAt > now);
  } catch {
    return true;
  }
}

/**
 * setItem that never throws. When storage is full it drops expired caches,
 * then every cache, retrying after each. Returns whether the value was saved.
 */
export function setItemWithRoom(key: string, value: string): boolean {
  if (typeof localStorage === "undefined") return false;
  for (const prune of [null, true, false] as const) {
    if (prune !== null) pruneCaches(prune);
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      // Full (or blocked): make room and try again.
    }
  }
  return false;
}

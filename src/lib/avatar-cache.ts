/**
 * Persistent avatar image cache (IndexedDB + object URLs).
 *
 * Avatars render through plain `<img src={remote}>`, which means every cold
 * start — and every iOS WebView cache eviction — re-fetches every visible
 * avatar and pops them in late. This module fetches once, stores the blob in
 * IndexedDB, and hands out `blob:` object URLs that paint instantly on repeat
 * views, with the remote URL as the fallback while a fetch is in flight.
 *
 * Never throws: storage pressure, private mode, or a missing IndexedDB all
 * degrade to plain remote loading.
 */

const DB_NAME = "disband-avatar-cache";
const STORE = "avatars";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 200;
const MAX_BLOB_BYTES = 2 * 1024 * 1024;

interface AvatarRow {
  url: string;
  blob: Blob;
  fetchedAt: number;
}

const objectUrls = new Map<string, string>();

function dbSupported(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "url" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("idb open failed"));
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("idb request failed"));
        t.oncomplete = () => db.close();
        t.onerror = () => db.close();
      }),
  );
}

/** Cached object URL for a remote avatar, or null on miss/expiry. */
export async function getCachedAvatarUrl(remoteUrl: string): Promise<string | null> {
  try {
    const hit = objectUrls.get(remoteUrl);
    if (hit) return hit;
    if (!dbSupported()) return null;
    const row = await tx<AvatarRow | undefined>("readonly", (s) => s.get(remoteUrl));
    if (!row || Date.now() - row.fetchedAt > MAX_AGE_MS) return null;
    const objectUrl = URL.createObjectURL(row.blob);
    objectUrls.set(remoteUrl, objectUrl);
    return objectUrl;
  } catch {
    return null;
  }
}

/** Fetch a remote avatar into the cache (fire-and-forget safe). */
export async function storeAvatar(remoteUrl: string): Promise<void> {
  try {
    if (!dbSupported() || objectUrls.has(remoteUrl)) return;
    const res = await fetch(remoteUrl, { mode: "cors", credentials: "omit" });
    if (!res.ok) return;
    const blob = await res.blob();
    if (!blob.size || blob.size > MAX_BLOB_BYTES) return;
    await tx("readwrite", (s) => s.put({ url: remoteUrl, blob, fetchedAt: Date.now() } as AvatarRow));
    // Best-effort LRU cap: drop the oldest rows beyond the limit.
    try {
      const keys = await tx<IDBValidKey[]>("readonly", (s) => s.getAllKeys());
      if (keys.length > MAX_ENTRIES) {
        const rows = await tx<AvatarRow[]>("readonly", (s) => s.getAll());
        rows
          .sort((a, b) => a.fetchedAt - b.fetchedAt)
          .slice(0, rows.length - MAX_ENTRIES)
          .forEach((r) => {
            void tx("readwrite", (s) => s.delete(r.url)).catch(() => undefined);
          });
      }
    } catch {
      /* cap is best-effort */
    }
  } catch {
    /* cache must never break rendering */
  }
}

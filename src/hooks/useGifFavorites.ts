"use client";

import { useCallback, useEffect, useReducer } from "react";

export interface FavGif {
  url: string;
  title: string | null;
}

type Listener = () => void;

const listeners = new Set<Listener>();
let cache: FavGif[] | null = null;
let inflight: Promise<FavGif[]> | null = null;

function notify() {
  for (const l of listeners) l();
}

async function fetchAll(): Promise<FavGif[]> {
  if (cache) return cache;
  if (!inflight) {
    inflight = fetch("/api/gifs/favorites")
      .then(async (res) => {
        if (!res.ok) return [];
        const json = (await res.json()) as { favorites?: FavGif[] };
        return json.favorites ?? [];
      })
      .catch(() => [])
      .finally(() => {
        inflight = null;
      });
  }
  cache = await inflight;
  return cache;
}

/**
 * Shared favorite-GIF state for message embeds. One fetch per page load no
 * matter how many GIFs render; toggles are optimistic and broadcast to every
 * mounted embed (and reconcile from the server on failure).
 */
export function useGifFavorites() {
  const [, tick] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    const l = () => tick();
    listeners.add(l);
    void fetchAll().then(() => notify());
    return () => {
      listeners.delete(l);
    };
  }, []);

  const toggle = useCallback(async (url: string, title: string | null, active: boolean) => {
    const prev = cache ? [...cache] : null;
    if (active) {
      cache = [...(cache ?? []).filter((f) => f.url !== url), { url, title }];
    } else {
      cache = (cache ?? []).filter((f) => f.url !== url);
    }
    notify();
    try {
      const res = await fetch("/api/gifs/favorites", {
        method: active ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, title }),
      });
      if (!res.ok && prev) {
        cache = prev;
        notify();
      }
    } catch {
      if (prev) {
        cache = prev;
        notify();
      }
    }
  }, []);

  return {
    favorites: cache ?? [],
    loaded: cache !== null,
    isFav: (url: string) => (cache ?? []).some((f) => f.url === url),
    toggle,
  };
}

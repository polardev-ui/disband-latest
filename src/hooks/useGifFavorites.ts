"use client";

import { useCallback, useEffect, useReducer } from "react";
import { gifFavKey } from "@/lib/gif-favorites";
import { getSupabaseClient, isAccessTokenExpired, refreshSessionOnce } from "@/lib/supabase/client";
import type { Session } from "@supabase/supabase-js";

export interface FavGif {
  url: string;
  title: string | null;
}

type Listener = () => void;

const listeners = new Set<Listener>();
let cache: FavGif[] | null = null;
let inflight: Promise<FavGif[]> | null = null;

/**
 * The session lives in localStorage, not cookies, so `getRouteUser` has
 * nothing to read unless we hand it the bearer token — without this the
 * route answers 401 and every favorite silently no-ops. A stale access
 * token gets one refresh first rather than failing the request that a
 * long-idle tab is most likely to make.
 */
async function authHeaders(): Promise<Record<string, string>> {
  try {
    const supabase = getSupabaseClient();
    let session = (await supabase.auth.getSession()).data.session;
    if (session && isAccessTokenExpired(session)) {
      const refreshed = await refreshSessionOnce();
      if ("session" in refreshed && refreshed.session) session = refreshed.session as Session;
    }
    return session ? { Authorization: `Bearer ${session.access_token}` } : {};
  } catch {
    return {};
  }
}

function notify() {
  for (const l of listeners) l();
}

async function fetchAll(force = false): Promise<FavGif[]> {
  if (cache && !force) return cache;
  if (!inflight) {
    // A failed read keeps whatever list we already have: a 429 or a blip
    // must not blank the Favorited tab (or every star in chat) out.
    const prev = cache;
    inflight = (async () => {
      const res = await fetch("/api/gifs/favorites", { headers: await authHeaders() });
      if (!res.ok) return prev ?? [];
      const json = (await res.json()) as { favorites?: FavGif[] };
      return json.favorites ?? [];
    })()
      .catch(() => prev ?? [])
      .finally(() => {
        inflight = null;
      });
  }
  cache = await inflight;
  return cache;
}

/**
 * Shared favorite-GIF state for the picker and every GIF in chat. One fetch
 * per page load no matter how many GIFs render; toggles are optimistic and
 * broadcast to every mounted star (and reconcile from the server on failure).
 *
 * Matching is by `gifFavKey`, so a GIF saved from the picker reads as filled
 * when the identical GIF shows up in anyone's message under a differently
 * spelled URL.
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

  const refresh = useCallback(async () => {
    await fetchAll(true);
    notify();
  }, []);

  const toggle = useCallback(async (url: string, title: string | null, active: boolean) => {
    const prev = cache ? [...cache] : null;
    const key = gifFavKey(url);
    // Unfavoriting must address the row as *stored*: the entry may have been
    // saved under a different spelling of the same GIF, and DELETE matches
    // the url column exactly.
    const stored = (cache ?? []).find((f) => gifFavKey(f.url) === key);
    if (active) {
      cache = [...(cache ?? []).filter((f) => gifFavKey(f.url) !== key), { url, title }];
    } else {
      cache = (cache ?? []).filter((f) => gifFavKey(f.url) !== key);
    }
    notify();
    try {
      const res = await fetch("/api/gifs/favorites", {
        method: active ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ url: active ? url : (stored?.url ?? url), title }),
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

  const isFav = useCallback(
    (url: string) => {
      const key = gifFavKey(url);
      return (cache ?? []).some((f) => gifFavKey(f.url) === key);
    },
    [],
  );

  return {
    favorites: cache ?? [],
    loaded: cache !== null,
    isFav,
    toggle,
    refresh,
  };
}

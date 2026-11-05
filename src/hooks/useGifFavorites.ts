"use client";

import { useCallback, useEffect, useReducer } from "react";
import { apiFetch } from "@/lib/api";
import { gifFavKey } from "@/lib/gif-favorites";
import { getSupabaseClient, isAccessTokenExpired, refreshSessionOnce } from "@/lib/supabase/client";
import type { Session } from "@supabase/supabase-js";

export interface FavGif {
  /** Stable numeric identity generated from the canonical URL. */
  id?: number;
  url: string;
  title: string | null;
}

type Listener = () => void;

const listeners = new Set<Listener>();
let cache: FavGif[] | null = null;
let inflight: Promise<FavGif[] | null> | null = null;
let lastFetch = 0;
let watching = false;

/** A star on another device shows up here when the tab comes back into focus. */
const FOCUS_REFETCH_MS = 30_000;

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

/**
 * A failed read keeps whatever list we already have: a 429 or a blip must
 * not blank the Favorited tab (or every star in chat) out. A failed *first*
 * read leaves the list unloaded rather than caching an empty one — on a
 * reload the first read usually races the session restore and gets a 401,
 * and caching that as "no favourites" hid them until the next full reload.
 *
 * `apiFetch` matters on desktop: the Tauri shell has no `/api`, so a
 * relative fetch never reached the server there.
 */
async function fetchAll(force = false): Promise<FavGif[] | null> {
  if (cache && !force) return cache;
  if (!inflight) {
    inflight = (async () => {
      const headers = await authHeaders();
      if (!headers.Authorization) return null;
      const res = await apiFetch("/api/gifs/favorites", { headers, cache: "no-store" });
      if (!res.ok) return null;
      const json = (await res.json()) as { favorites?: FavGif[] };
      return json.favorites ?? [];
    })()
      .catch(() => null)
      .finally(() => {
        inflight = null;
      });
  }
  const next = await inflight;
  if (next) {
    cache = next;
    lastFetch = Date.now();
  }
  return cache;
}

/**
 * Once per page: load when the session arrives, forget on sign-out, and
 * catch up on stars made elsewhere when the window regains focus.
 */
function watchSession() {
  if (watching || typeof window === "undefined") return;
  watching = true;
  getSupabaseClient().auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
      cache = null;
      notify();
    } else if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || (event === "TOKEN_REFRESHED" && !cache)) {
      void fetchAll(event === "SIGNED_IN").then(() => notify());
    }
  });
  const onFocus = () => {
    if (document.visibilityState !== "visible") return;
    if (Date.now() - lastFetch < FOCUS_REFETCH_MS) return;
    void fetchAll(true).then(() => notify());
  };
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onFocus);
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
    watchSession();
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
    // Starring before the list has loaded would otherwise leave a one-item
    // cache that reads as the whole list.
    if (!cache) await fetchAll();
    const prev = cache ? [...cache] : null;
    const key = gifFavKey(url);
    // Unfavoriting must address the row as *stored*: the entry may have been
    // saved under a different spelling of the same GIF, and DELETE matches
    // the url column exactly.
    const stored = (cache ?? []).find((f) => gifFavKey(f.url) === key);
    if (active) {
      cache = [...(cache ?? []).filter((f) => gifFavKey(f.url) !== key), { id: stored?.id, url, title }];
    } else {
      cache = (cache ?? []).filter((f) => gifFavKey(f.url) !== key);
    }
    notify();
    try {
      const res = await apiFetch("/api/gifs/favorites", {
        method: active ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify(
          active
            ? { url, title }
            : stored?.id != null
              ? { id: stored.id }
              : { url: stored?.url ?? url },
        ),
      });
      if (!res.ok) {
        if (prev) {
          cache = prev;
          notify();
        }
      } else if (active) {
        // Adopt the server's numeric id — and, for an alias of an existing
        // favourite, its stored URL — so a later unstar is unambiguous.
        const json = (await res.json().catch(() => null)) as { favorite?: FavGif } | null;
        if (json?.favorite) {
          const favorite = json.favorite;
          cache = (cache ?? []).map((f) => (gifFavKey(f.url) === key ? favorite : f));
          notify();
        }
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

"use client";

/**
 * Favorites: channels, DMs and group chats someone stars (migration 0237).
 * One store per signed-in account, shared by the rail, the Favorites list,
 * the channel header star and every context menu that offers "Favorite".
 */

import { useEffect } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { createStore, friendlyError, isMissingFeatureError, useStore } from "@/lib/feature-store";

export type FavoriteKind = "channel" | "dm" | "group";

export interface Favorite {
  kind: FavoriteKind;
  target_id: string;
  position: number;
  created_at: string;
}

interface FavoritesState {
  userId: string | null;
  items: Favorite[];
  loaded: boolean;
  /** The table isn't there (migration not applied): hide the feature. */
  unavailable: boolean;
}

const EMPTY: FavoritesState = { userId: null, items: [], loaded: false, unavailable: false };
const store = createStore<FavoritesState>(EMPTY);
let loading: Promise<void> | null = null;

export const FAVORITES_LIMIT = 200;

const keyOf = (kind: FavoriteKind, id: string) => `${kind}:${id}`;

export async function loadFavorites(userId: string): Promise<void> {
  if (loading && store.get().userId === userId) return loading;
  if (store.get().userId !== userId) store.set({ ...EMPTY, userId });
  const run = (async () => {
    try {
      const { data, error } = await getSupabaseClient()
        .from("favorites")
        .select("kind, target_id, position, created_at")
        .eq("user_id", userId)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (store.get().userId !== userId) return;
      if (error) {
        store.set((s) => ({ ...s, loaded: true, unavailable: isMissingFeatureError(error) }));
        return;
      }
      store.set({ userId, items: (data as Favorite[] | null) ?? [], loaded: true, unavailable: false });
    } catch {
      if (store.get().userId === userId) store.set((s) => ({ ...s, loaded: true }));
    }
  })();
  loading = run;
  try {
    await run;
  } finally {
    if (loading === run) loading = null;
  }
}

export function isFavorite(kind: FavoriteKind, id: string | null | undefined): boolean {
  if (!id) return false;
  return store.get().items.some((f) => f.kind === kind && f.target_id === id);
}

/**
 * Star or unstar. Optimistic: the star flips at once and flips back if the
 * write fails. Returns an error message, or null.
 */
export async function toggleFavorite(userId: string, kind: FavoriteKind, targetId: string): Promise<string | null> {
  const state = store.get();
  if (state.userId !== userId || state.unavailable) return "Favorites aren't available right now.";
  const exists = state.items.some((f) => f.kind === kind && f.target_id === targetId);
  const supabase = getSupabaseClient();

  if (exists) {
    const before = state.items;
    store.set((s) => ({ ...s, items: s.items.filter((f) => keyOf(f.kind, f.target_id) !== keyOf(kind, targetId)) }));
    const { error } = await supabase
      .from("favorites")
      .delete()
      .eq("user_id", userId)
      .eq("kind", kind)
      .eq("target_id", targetId);
    if (error) {
      if (store.get().userId === userId) store.set((s) => ({ ...s, items: before }));
      return friendlyError(error, "Couldn't remove that favorite. Try again.");
    }
    return null;
  }

  if (state.items.length >= FAVORITES_LIMIT) {
    return `You can keep up to ${FAVORITES_LIMIT} favorites. Remove one to add another.`;
  }
  const position = state.items.reduce((max, f) => Math.max(max, f.position), -1) + 1;
  const row: Favorite = { kind, target_id: targetId, position, created_at: new Date().toISOString() };
  store.set((s) => ({ ...s, items: [...s.items, row] }));
  const { error } = await supabase
    .from("favorites")
    .insert({ user_id: userId, kind, target_id: targetId, position });
  if (error) {
    // Already starred on another device: keep the star, it's true.
    if (error.code === "23505") return null;
    if (store.get().userId === userId) {
      store.set((s) => ({ ...s, items: s.items.filter((f) => keyOf(f.kind, f.target_id) !== keyOf(kind, targetId)) }));
    }
    return friendlyError(error, "Couldn't add that favorite. Try again.");
  }
  return null;
}

/** Loaded, and the backend has the table. */
export function favoritesAvailable(): boolean {
  const state = store.get();
  return state.loaded && !state.unavailable;
}

export function resetFavorites() {
  store.set(EMPTY);
}

/** The signed-in account's favorites; loads them the first time. */
export function useFavorites(userId: string | null | undefined): FavoritesState {
  const state = useStore(store);
  useEffect(() => {
    if (!userId) return;
    if (store.get().userId !== userId || (!store.get().loaded && !loading)) void loadFavorites(userId);
  }, [userId]);
  return userId && state.userId === userId ? state : EMPTY;
}

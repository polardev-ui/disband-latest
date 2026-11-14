"use client";

/**
 * DMs and group chats pinned to the top of the Direct Messages list
 * (migration 0268). Personal and synced across devices. Pinned
 * conversations sit above everything else, the most recently pinned first.
 */

import { useEffect } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { createStore, friendlyError, isMissingFeatureError, useStore } from "@/lib/feature-store";

export type PinKind = "dm" | "group";

interface Pin {
  kind: PinKind;
  conversation_id: string;
  pinned_at: string;
}

interface PinsState {
  userId: string | null;
  items: Pin[];
  loaded: boolean;
  /** The table isn't there yet: hide the feature. */
  unavailable: boolean;
}

const EMPTY: PinsState = { userId: null, items: [], loaded: false, unavailable: false };
const store = createStore<PinsState>(EMPTY);
let loading: Promise<void> | null = null;

export const PINS_LIMIT = 50;

async function load(userId: string): Promise<void> {
  if (loading && store.get().userId === userId) return loading;
  if (store.get().userId !== userId) store.set({ ...EMPTY, userId });
  const run = (async () => {
    try {
      const { data, error } = await getSupabaseClient()
        .from("pinned_conversations")
        .select("kind, conversation_id, pinned_at")
        .eq("user_id", userId);
      if (store.get().userId !== userId) return;
      if (error) {
        store.set((s) => ({ ...s, loaded: true, unavailable: isMissingFeatureError(error) }));
        return;
      }
      store.set({ userId, items: (data as Pin[] | null) ?? [], loaded: true, unavailable: false });
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

export function pinsAvailable(): boolean {
  const s = store.get();
  return s.loaded && !s.unavailable;
}

/** When it was pinned, or null if it isn't. */
export function pinnedAt(kind: PinKind, id: string | null | undefined): string | null {
  if (!id) return null;
  return store.get().items.find((p) => p.kind === kind && p.conversation_id === id)?.pinned_at ?? null;
}

/** Pin or unpin. Optimistic. Returns an error message, or null. */
export async function togglePin(userId: string, kind: PinKind, id: string): Promise<string | null> {
  const state = store.get();
  if (state.userId !== userId || state.unavailable) return "Pinning isn't available right now.";
  const supabase = getSupabaseClient();
  const same = (p: Pin) => p.kind === kind && p.conversation_id === id;
  const before = state.items;

  if (before.some(same)) {
    store.set((s) => ({ ...s, items: s.items.filter((p) => !same(p)) }));
    const { error } = await supabase
      .from("pinned_conversations")
      .delete()
      .eq("user_id", userId)
      .eq("kind", kind)
      .eq("conversation_id", id);
    if (error) {
      if (store.get().userId === userId) store.set((s) => ({ ...s, items: before }));
      return friendlyError(error, "Couldn't unpin that. Try again.");
    }
    return null;
  }

  if (before.length >= PINS_LIMIT) return `You can pin up to ${PINS_LIMIT} conversations. Unpin one to pin another.`;
  const row: Pin = { kind, conversation_id: id, pinned_at: new Date().toISOString() };
  store.set((s) => ({ ...s, items: [...s.items, row] }));
  const { error } = await supabase.from("pinned_conversations").insert({ user_id: userId, kind, conversation_id: id });
  if (error) {
    if (error.code === "23505") return null; // pinned on another device already
    if (store.get().userId === userId) store.set((s) => ({ ...s, items: s.items.filter((p) => !same(p)) }));
    return friendlyError(error, "Couldn't pin that. Try again.");
  }
  return null;
}

export function resetPins() {
  store.set(EMPTY);
}

/** The signed-in account's pins; loads them the first time. */
export function usePinnedConversations(userId: string | null | undefined): PinsState {
  const state = useStore(store);
  useEffect(() => {
    if (!userId) return;
    if (store.get().userId !== userId || (!store.get().loaded && !loading)) void load(userId);
  }, [userId]);
  return userId && state.userId === userId ? state : EMPTY;
}

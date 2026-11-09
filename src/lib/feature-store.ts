"use client";

/**
 * Shared plumbing for the per-account feature lists (favorites, saved
 * messages, appearance): a tiny observable store, and a test for "the
 * backend doesn't have this feature yet".
 *
 * The second matters because the apps can ship before a migration is applied
 * (or a self-hosted database can lag behind). A missing table or function
 * must make the feature step aside quietly, not throw or show an error on
 * every screen, so callers check `isMissingFeatureError` and mark the
 * feature unavailable.
 */

import { useSyncExternalStore } from "react";

export interface Store<T> {
  get: () => T;
  set: (next: T | ((prev: T) => T)) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set: (next) => {
      const value = typeof next === "function" ? (next as (prev: T) => T)(state) : next;
      if (Object.is(value, state)) return;
      state = value;
      for (const listener of [...listeners]) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

interface PostgrestLikeError {
  code?: string | null;
  message?: string | null;
}

/**
 * Postgres "undefined table/column/function" and PostgREST's "not in the
 * schema cache" codes: the migration behind a feature isn't there.
 */
export function isMissingFeatureError(error: PostgrestLikeError | null | undefined): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  if (["42P01", "42703", "42883", "PGRST200", "PGRST202", "PGRST204", "PGRST205"].includes(code)) return true;
  return /does not exist|could not find the (table|function)|schema cache/i.test(error.message ?? "");
}

/** A friendly message for a failed write, without database jargon. */
export function friendlyError(error: PostgrestLikeError | null | undefined, fallback: string): string {
  const message = (error?.message ?? "").trim();
  if (!message) return fallback;
  // Messages raised by our own functions are written for people already.
  if (/^[A-Z][^]*[.!?]$/.test(message) && !/violates|syntax|relation|column|permission denied|JWT/i.test(message)) {
    return message;
  }
  return fallback;
}

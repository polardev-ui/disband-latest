"use client";

import type { Profile } from "@/lib/supabase/types";
import type { Session } from "@supabase/supabase-js";

/**
 * A previously signed-in account that can be switched back to with one click.
 * The tokens let us re-submit the session straight to GoTrue — the same
 * mechanism the app uses to restore a session at launch — so switching only
 * persists once the target account is genuinely active in this tab.
 */
export interface SavedSession {
  user_id: string;
  email: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  access_token: string;
  refresh_token: string;
  saved_at: number;
}

const STORAGE_KEY = "disband-saved-sessions";

export function getSavedSessions(): SavedSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as SavedSession[]).filter(
      (s): s is SavedSession =>
        typeof s === "object" &&
        s !== null &&
        typeof (s as SavedSession).user_id === "string" &&
        typeof (s as SavedSession).refresh_token === "string",
    );
  } catch {
    return [];
  }
}

function persist(list: SavedSession[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // storage unavailable — switching still works within this tab
  }
}

/** Upsert a signed-in session into the saved list (refreshing stored tokens). */
export function saveSession(session: Session | null | undefined, profile?: Profile | null): void {
  if (!session?.user?.id || !session.refresh_token) return;
  const meta = (session.user.user_metadata ?? {}) as Record<string, unknown>;
  const existing = getSavedSessions().find((s) => s.user_id === session.user.id);
  const entry: SavedSession = {
    user_id: session.user.id,
    email: session.user.email ?? existing?.email ?? null,
    username:
      (typeof meta.username === "string" ? meta.username : null)
      ?? existing?.username ?? profile?.username ?? null,
    display_name:
      (typeof meta.display_name === "string" ? meta.display_name : null)
      ?? existing?.display_name ?? profile?.display_name ?? null,
    avatar_url: profile?.avatar_url ?? existing?.avatar_url ?? null,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    saved_at: existing?.saved_at ?? Date.now(),
  };
  const list = getSavedSessions();
  const idx = list.findIndex((s) => s.user_id === entry.user_id);
  if (idx >= 0) list[idx] = entry;
  else list.unshift(entry);
  persist(list);
}

export function removeSavedSession(userId: string): void {
  persist(getSavedSessions().filter((s) => s.user_id !== userId));
}

export function savedSessionsRemainder(currentUserId: string | null): SavedSession[] {
  return getSavedSessions().filter((s) => s.user_id !== currentUserId);
}
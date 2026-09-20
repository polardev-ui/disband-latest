"use client";

import type { Profile } from "@/lib/supabase/types";
import type { Session } from "@supabase/supabase-js";

export interface SavedSession {
  user_id: string;
  email: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  saved_at: number;
}

const STORAGE_KEY = "disband-saved-sessions";
const TOKEN_KEY_PREFIX = "disband-switch-session:";

export function getSavedSessionTokens(userId: string): { access_token: string; refresh_token: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(TOKEN_KEY_PREFIX + userId);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const tokens = value as Record<string, unknown>;
    return typeof tokens.access_token === "string" && typeof tokens.refresh_token === "string"
      && tokens.access_token && tokens.refresh_token
      ? { access_token: tokens.access_token, refresh_token: tokens.refresh_token }
      : null;
  } catch {
    return null;
  }
}

export function clearSavedSessionTokens(userId: string): void {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.removeItem(TOKEN_KEY_PREFIX + userId); } catch { /* storage unavailable */ }
}

export function getSavedSessions(): SavedSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const safe = (parsed as Array<SavedSession & Record<string, unknown>>).filter(
      (s): s is SavedSession & Record<string, unknown> =>
        typeof s === "object" &&
        s !== null &&
        typeof (s as SavedSession).user_id === "string" &&
        typeof (s as SavedSession).saved_at === "number",
    ).map(({ user_id, email, username, display_name, avatar_url, saved_at }) => ({
      user_id,
      email: typeof email === "string" ? email : null,
      username: typeof username === "string" ? username : null,
      display_name: typeof display_name === "string" ? display_name : null,
      avatar_url: typeof avatar_url === "string" ? avatar_url : null,
      saved_at,
    }));
    // Remove bearer tokens left by older versions immediately.
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
    return safe;
  } catch {
    return [];
  }
}

function persist(list: SavedSession[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {

  }
}

export function saveSession(session: Session | null | undefined, profile?: Profile | null): void {
  if (!session?.user?.id) return;
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
    saved_at: existing?.saved_at ?? Date.now(),
  };
  if (session.access_token && session.refresh_token) {
    try {
      window.sessionStorage.setItem(TOKEN_KEY_PREFIX + session.user.id, JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      }));
    } catch { /* account still appears, but switching will require sign in */ }
  }
  const list = getSavedSessions();
  const idx = list.findIndex((s) => s.user_id === entry.user_id);
  if (idx >= 0) list[idx] = entry;
  else list.unshift(entry);
  persist(list);
}

export function removeSavedSession(userId: string): void {
  clearSavedSessionTokens(userId);
  persist(getSavedSessions().filter((s) => s.user_id !== userId));
}

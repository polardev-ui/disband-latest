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
    // Rewrite legacy entries immediately so previously stored bearer tokens
    // are removed instead of surviving until the next account update.
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
  const list = getSavedSessions();
  const idx = list.findIndex((s) => s.user_id === entry.user_id);
  if (idx >= 0) list[idx] = entry;
  else list.unshift(entry);
  persist(list);
}

export function removeSavedSession(userId: string): void {
  persist(getSavedSessions().filter((s) => s.user_id !== userId));
}

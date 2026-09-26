"use client";

/**
 * Persistent per-account refresh tokens for account switching.
 *
 * Split out from `@/lib/saved-sessions` deliberately: that module keeps
 * bearer material out of persistent storage by design (its security test
 * pins that), while switching accounts across restarts fundamentally needs a
 * persisted credential. Keeping the two policies in two modules makes the
 * tradeoff explicit instead of silently weakening the original.
 *
 * What is stored: ONLY the refresh token, under `disband-switch-refresh:<id>`.
 * Access tokens stay tab-scoped (sessionStorage, via saved-sessions). A
 * refresh token alone can still mint sessions, so this is not "safe" storage —
 * it matches the app's existing posture (the Supabase client already persists
 * the *active* session's refresh token in localStorage; see
 * `src/lib/supabase/client.ts` persistSession/storage). Removing a saved
 * account must clear its refresh token too.
 */

const REFRESH_KEY_PREFIX = "disband-switch-refresh:";

export function getSavedRefreshToken(userId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(REFRESH_KEY_PREFIX + userId);
    return typeof raw === "string" && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

export function saveSwitchRefreshToken(userId: string, refreshToken: string): void {
  if (typeof window === "undefined") return;
  if (!userId || !refreshToken) return;
  try {
    window.localStorage.setItem(REFRESH_KEY_PREFIX + userId, refreshToken);
  } catch { /* account still appears, but switching will require sign in */ }
}

export function clearSavedRefreshToken(userId: string): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(REFRESH_KEY_PREFIX + userId); } catch { /* storage unavailable */ }
}

"use client";

import type { User } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  VOICE_SETTINGS_EVENT,
  isPortableVoiceKey,
  snapshotPortableVoiceSettings,
  writeSetting,
  type VoiceSettingsEventDetail,
} from "@/lib/audio-settings";

/*
 Voice & Video settings follow the account, so the web app and the desktop
 app sound the same. They are kept in the account's private auth metadata
 (like the accepted terms version), which only the signed-in user can read
 or write; nothing about them is on the public profile.

 Each side keeps when it last changed something. Whichever changed last
 wins, as a whole: a reset on one device resets the other. Device choices
 never sync (see PORTABLE_VOICE_KEYS).
*/

type RemoteVoiceSettings = { updatedAt: number; values: Record<string, string> };

const STAMP_PREFIX = "disband:voice-settings-updated-at:";
const PUSH_DELAY_MS = 1_500;
const FOCUS_PULL_INTERVAL_MS = 30_000;

let started = false;
let currentUserId: string | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let lastFocusPull = 0;

function localStamp(userId: string): number {
  try {
    return Number(localStorage.getItem(STAMP_PREFIX + userId)) || 0;
  } catch {
    return 0;
  }
}

function setLocalStamp(userId: string, value: number) {
  try {
    localStorage.setItem(STAMP_PREFIX + userId, String(value));
  } catch {
    // Storage blocked: the next change pushes again, which is harmless.
  }
}

function readRemote(user: User): RemoteVoiceSettings | null {
  const raw = (user.user_metadata as Record<string, unknown> | undefined)?.voice_settings;
  if (!raw || typeof raw !== "object") return null;
  const { updatedAt, values } = raw as Partial<RemoteVoiceSettings>;
  if (typeof updatedAt !== "number" || !values || typeof values !== "object") return null;
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    // Only ever our own setting names and short values.
    if (isPortableVoiceKey(key) && typeof value === "string" && value.length <= 64) clean[key] = value;
  }
  return { updatedAt, values: clean };
}

function applyRemote(remote: RemoteVoiceSettings) {
  const local = snapshotPortableVoiceSettings();
  for (const key of Object.keys(local)) {
    if (!(key in remote.values)) writeSetting(key, null, "remote");
  }
  for (const [key, value] of Object.entries(remote.values)) {
    if (local[key] !== value) writeSetting(key, value, "remote");
  }
}

function reconcile(user: User | null | undefined) {
  if (!user) {
    currentUserId = null;
    return;
  }
  currentUserId = user.id;
  const remote = readRemote(user);
  const stamp = localStamp(user.id);
  if (remote && remote.updatedAt > stamp) {
    applyRemote(remote);
    setLocalStamp(user.id, remote.updatedAt);
    return;
  }
  if (stamp > (remote?.updatedAt ?? 0)) {
    schedulePush();
    return;
  }
  // First time on this account: whatever this device has set up so far
  // becomes the account's settings.
  if (!remote && Object.keys(snapshotPortableVoiceSettings()).length > 0) {
    setLocalStamp(user.id, Date.now());
    schedulePush();
  }
}

function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void push();
  }, PUSH_DELAY_MS);
}

async function push() {
  const userId = currentUserId;
  if (!userId) return;
  const voice_settings: RemoteVoiceSettings = {
    updatedAt: localStamp(userId) || Date.now(),
    values: snapshotPortableVoiceSettings(),
  };
  try {
    await getSupabaseClient().auth.updateUser({ data: { voice_settings } });
  } catch {
    // Offline: the stamp is still newer, so the next sign-in or focus pushes.
  }
}

async function pullFresh() {
  try {
    const { data } = await getSupabaseClient().auth.getUser();
    reconcile(data.user);
  } catch {
    // Offline: keep what this device has.
  }
}

/** Starts keeping Voice & Video settings in step with the account. Idempotent. */
export function startVoiceSettingsSync() {
  if (started || typeof window === "undefined") return;
  started = true;

  window.addEventListener(VOICE_SETTINGS_EVENT, (event) => {
    const detail = (event as CustomEvent<VoiceSettingsEventDetail>).detail;
    if (!detail || detail.source !== "local" || !isPortableVoiceKey(detail.key)) return;
    if (!currentUserId) return;
    setLocalStamp(currentUserId, Date.now());
    schedulePush();
  });

  const supabase = getSupabaseClient();
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      currentUserId = null;
      return;
    }
    if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
      reconcile(session?.user);
    }
  });

  // Coming back to the app (say, from the other one) picks up changes made
  // there without waiting for the hourly token refresh.
  window.addEventListener("focus", () => {
    if (!currentUserId || Date.now() - lastFocusPull < FOCUS_PULL_INTERVAL_MS) return;
    lastFocusPull = Date.now();
    void pullFresh();
  });

  void pullFresh();
}

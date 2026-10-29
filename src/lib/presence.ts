import type { Profile, UserStatus } from "@/lib/supabase/types";
import type { Listening } from "@/lib/music-presence";

export const PRESENCE_CHANNEL = "presence:global";

export const AWAY_AFTER_MS = 5 * 60 * 1000;

export interface PresencePayload {
  userId: string;
  status: UserStatus;
  /** Live "now listening"; null/absent when nothing is playing. */
  listening?: Listening | null;
  /** Live game activity; null/absent when not playing. */
  activity?: import("@/lib/activity").Activity | null;
}

export type PresenceMap = Map<string, UserStatus>;

/**
 * Live listening by user id. A present key means that user's client told us
 * what it is (or isn't) playing right now — `null` is "present, not playing"
 * and is deliberately distinct from an absent key ("no live info; trust the
 * profile row").
 */
export type ListeningMap = Map<string, Listening | null>;

/**
 * What is this profile listening to? Prefer the live presence entry (it is
 * what their client says *right now*); fall back to the value persisted on
 * the profile row, but only while it is plausibly current — a song started
 * more than six hours ago belongs to a session that ended (the row is only
 * rewritten while Disband is running).
 */
export function listeningFor(
  profile: Pick<Profile, "id" | "listening"> | null | undefined,
  listening: ListeningMap | null,
  now = Date.now(),
): Listening | null {
  if (!profile) return null;
  const live = listening?.get(profile.id);
  if (live !== undefined) return live;
  const stale = profile.listening;
  if (!stale) return null;
  const started = Date.parse(stale.started_at);
  if (Number.isFinite(started) && now - started > 6 * 60 * 60 * 1000) return null;
  return stale;
}

/** Collect the live listening entries out of a presence-state snapshot. */
export function flattenPresenceListening(
  state: Record<string, Partial<PresencePayload>[] | undefined>,
): ListeningMap {
  const map = new Map<string, Listening | null>();
  for (const key of Object.keys(state)) {
    for (const entry of state[key] ?? []) {
      if (entry && typeof entry.userId === "string") {
        map.set(entry.userId, (entry.listening as Listening | null | undefined) ?? null);
      }
    }
  }
  return map;
}

export function presenceStatusFor(
  profile: Pick<Profile, "id" | "status"> | null | undefined,
  presence: PresenceMap | null,
): UserStatus {
  if (!profile) return "offline";
  return presence?.get(profile.id) ?? "offline";
}

export function statusLabel(status: UserStatus): string {
  switch (status) {
    case "online":
      return "Online";
    case "idle":
      return "Away";
    case "dnd":
      return "Do Not Disturb";
    case "offline":
      return "Offline";
  }
}

export const STATUS_DURATION_PRESETS = [
  { id: "10m", label: "10 mins", ms: 10 * 60 * 1000 },
  { id: "30m", label: "30 mins", ms: 30 * 60 * 1000 },
  { id: "1h", label: "1 hour", ms: 60 * 60 * 1000 },
  { id: "3h", label: "3 hours", ms: 3 * 60 * 60 * 1000 },
  { id: "1d", label: "1 day", ms: 24 * 60 * 60 * 1000 },
  { id: "3d", label: "3 days", ms: 3 * 24 * 60 * 60 * 1000 },
  { id: "never", label: "Never", ms: null },
] as const;

export type StatusDurationId = (typeof STATUS_DURATION_PRESETS)[number]["id"];

export function expiresAtForDuration(id: StatusDurationId, now = Date.now()): string | null {
  const preset = STATUS_DURATION_PRESETS.find((p) => p.id === id);
  if (!preset || preset.ms == null) return null;
  return new Date(now + preset.ms).toISOString();
}

export function activeStatusNote(
  profile: Pick<Profile, "status_note" | "status_expires_at"> | null | undefined,
  now = Date.now(),
): string | null {
  const note = profile?.status_note?.trim();
  if (!note) return null;
  const expires = profile?.status_expires_at;
  if (expires && Number.isFinite(Date.parse(expires)) && Date.parse(expires) <= now) return null;
  return note;
}

export function statusExpiryLabel(expiresAt: string | null | undefined, now = Date.now()): string {
  if (!expiresAt) return "Never";
  const ms = Date.parse(expiresAt) - now;
  if (!Number.isFinite(ms) || ms <= 0) return "Expired";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `Clears in ${mins} min${mins === 1 ? "" : "s"}`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `Clears in ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `Clears in ${days} day${days === 1 ? "" : "s"}`;
}

export function presetForExpiresAt(expiresAt: string | null | undefined, now = Date.now()): StatusDurationId {
  if (!expiresAt) return "never";
  const ms = Date.parse(expiresAt) - now;
  if (!Number.isFinite(ms) || ms <= 0) return "10m";
  for (const p of STATUS_DURATION_PRESETS) {
    if (p.ms != null && ms <= p.ms * 1.15) return p.id;
  }
  return "never";
}

export function flattenPresenceState(
  state: Record<string, Partial<PresencePayload>[] | undefined>,
): PresenceMap {
  const map = new Map<string, UserStatus>();
  for (const key of Object.keys(state)) {
    for (const entry of state[key] ?? []) {
      if (entry && typeof entry.userId === "string") {
        const next = entry.status ?? "online";
        const current = map.get(entry.userId);
        // A person can have more than one live client (two tabs, web + phone).
        // An invisible/offline entry must never mask another session that is
        // actually online. Otherwise the roster can drop someone who is right
        // there, depending on which presence key happened to sync last.
        if (current === undefined || current === "offline" || next !== "offline") {
          map.set(entry.userId, next);
        }
      }
    }
  }
  return map;
}

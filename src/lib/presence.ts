import type { Profile, UserStatus } from "@/lib/supabase/types";

/**
 * Live presence is connection-based: every signed-in client joins a shared
 * Realtime presence channel and tracks its own user id + effective status.
 * When the app closes (or the socket dies), the Realtime server drops that
 * presence automatically, so stale "online" rows can never persist.
 */
export const PRESENCE_CHANNEL = "presence:global";

/** How long with no activity before an "online" user is auto-marked away. */
export const AWAY_AFTER_MS = 5 * 60 * 1000;

export interface PresencePayload {
  userId: string;
  status: UserStatus;
}

export type PresenceMap = Map<string, UserStatus>;

export function presenceStatusFor(
  profile: Pick<Profile, "id" | "status"> | null | undefined,
  presence: PresenceMap | null,
): UserStatus {
  if (!profile) return "offline";
  return presence?.get(profile.id) ?? "offline";
}

/** Visible label for a status — "idle" reads as Away everywhere. */
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

/* ------------------------------------------------------------------ */
/* Custom status (note + duration). Discord-style: a free-text note     */
/* with a lifetime. Minimum 10 minutes; "never" means until changed.   */
/* ------------------------------------------------------------------ */

/** Duration presets for a custom status. `ms: null` = never expires. */
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

/** ISO instant for a duration preset chosen now, or null for "never". */
export function expiresAtForDuration(id: StatusDurationId, now = Date.now()): string | null {
  const preset = STATUS_DURATION_PRESETS.find((p) => p.id === id);
  if (!preset || preset.ms == null) return null;
  return new Date(now + preset.ms).toISOString();
}

/**
 * The note to actually render for a profile: the stored note, unless it has
 * lapsed (status_expires_at in the past), in which case null — the status is
 * treated as cleared without needing a server round-trip.
 */
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

/** Human label for when a status clears, e.g. "Clears in 2 hours" / "Never". */
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

/**
 * Best-guess preset id for a stored expires_at (used to seed pickers).
 * Returns "never" for null/invalid, else the closest preset at or after now.
 */
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
        map.set(entry.userId, entry.status ?? "online");
      }
    }
  }
  return map;
}

import type { Profile, UserStatus } from "@/lib/supabase/types";

export const PRESENCE_CHANNEL = "presence:global";

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
        map.set(entry.userId, entry.status ?? "online");
      }
    }
  }
  return map;
}

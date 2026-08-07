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

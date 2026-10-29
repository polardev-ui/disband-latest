/*
 Game activity ("Playing Roblox"), the counterpart of music presence.

 It reaches a profile three ways:
   - the desktop app spotting a running game (Steam, Roblox, a known title),
   - a game talking Discord's Rich Presence protocol to the desktop app,
     which listens on the same local socket Discord would,
   - a developer's game or server calling PUT /api/v1/activity with a
     Sign in with Disband token that has the activities.write scope.

 Every activity carries an expiry. The desktop app renews it every minute
 while the game runs and the API caps it at an hour, so an app that crashes
 never leaves someone "playing" forever.
*/

export type ActivityKind = "playing" | "streaming" | "listening" | "watching" | "competing";
export type ActivitySource = "process" | "rpc" | "api";

export interface Activity {
  kind: ActivityKind;
  /** The game or app: "Roblox", "Counter-Strike 2". */
  name: string;
  /** Rich Presence lines: "Ranked match", "In a party (2 of 4)". */
  details?: string | null;
  state?: string | null;
  /** When the session started (ms since epoch, as ISO). Drives the "12:04 elapsed" timer. */
  started_at?: string | null;
  /** When a countdown ends, if the game shows one. */
  ends_at?: string | null;
  large_image?: string | null;
  large_text?: string | null;
  small_image?: string | null;
  small_text?: string | null;
  source: ActivitySource;
  /** Discord application id or Disband Link id, when the game sent one. */
  application_id?: string | null;
  /** After this the activity is treated as gone. */
  expires_at: string;
}

export type ActivityMap = Map<string, Activity | null>;

/** How long a renewed activity stays up without another renewal. */
export const ACTIVITY_TTL_MS = 3 * 60_000;

export const ACTIVITY_VERB: Record<ActivityKind, string> = {
  playing: "Playing",
  streaming: "Streaming",
  listening: "Listening to",
  watching: "Watching",
  competing: "Competing in",
};

export function isLive(activity: Activity | null | undefined, now = Date.now()): activity is Activity {
  if (!activity?.name) return false;
  const expires = Date.parse(activity.expires_at);
  return Number.isFinite(expires) && expires > now;
}

/**
 * What someone is doing right now. Their own client's presence is the
 * authority for what their computer detected; the profile row covers people
 * whose client isn't online, and activity a game set through the API (which
 * their client doesn't know about).
 */
export function activityFor(
  profile: { id: string; activity?: Activity | null } | null | undefined,
  map: ActivityMap | null,
  now = Date.now(),
): Activity | null {
  if (!profile) return null;
  const live = map?.get(profile.id);
  if (isLive(live, now)) return live;
  const stored = profile.activity;
  if (!isLive(stored, now)) return null;
  // A present-but-empty presence entry means their client saw the game stop.
  return live === undefined || stored.source === "api" ? stored : null;
}

/** "Playing Roblox". */
export function activityHeadline(a: Activity): string {
  return `${ACTIVITY_VERB[a.kind] ?? "Playing"} ${a.name}`;
}

/** "1:04:09" or "12:04" since `startedAt`. */
export function elapsed(startedAt: string | null | undefined, now = Date.now()): string | null {
  const start = startedAt ? Date.parse(startedAt) : NaN;
  if (!Number.isFinite(start) || start > now) return null;
  const s = Math.floor((now - start) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

const text = (v: unknown, max: number) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
const image = (v: unknown) =>
  typeof v === "string" && /^https:\/\/\S{1,1000}$/.test(v.trim()) ? v.trim() : null;
const isoFrom = (v: unknown) => {
  if (typeof v === "number" && Number.isFinite(v)) {
    // Discord timestamps are ms; some libraries send seconds.
    return new Date(v < 1e12 ? v * 1000 : v).toISOString();
  }
  if (typeof v === "string" && Number.isFinite(Date.parse(v))) return new Date(v).toISOString();
  return null;
};

const KIND_BY_DISCORD_TYPE: Record<number, ActivityKind> = { 0: "playing", 1: "streaming", 2: "listening", 3: "watching", 5: "competing" };

/**
 * Turn untrusted input (an API body, or a Discord SET_ACTIVITY payload) into
 * a clean Activity. Images must be https URLs; Discord asset keys, which only
 * Discord can resolve, are dropped. Returns null when there is no name.
 */
export function sanitizeActivity(
  raw: Record<string, unknown> | null | undefined,
  opts: { name?: string | null; source: ActivitySource; applicationId?: string | null; ttlMs?: number },
): Activity | null {
  if (!raw && !opts.name) return null;
  const r = raw ?? {};
  const name = text(opts.name ?? r.name, 80);
  if (!name) return null;
  const ts = (r.timestamps ?? {}) as Record<string, unknown>;
  const assets = (r.assets ?? {}) as Record<string, unknown>;
  const kind = typeof r.type === "number"
    ? KIND_BY_DISCORD_TYPE[r.type] ?? "playing"
    : (["playing", "streaming", "listening", "watching", "competing"] as const).find((k) => k === r.kind) ?? "playing";
  return {
    kind,
    name,
    details: text(r.details, 128),
    state: text(r.state, 128),
    started_at: isoFrom(r.started_at ?? ts.start),
    ends_at: isoFrom(r.ends_at ?? ts.end),
    large_image: image(r.large_image ?? assets.large_image),
    large_text: text(r.large_text ?? assets.large_text, 128),
    small_image: image(r.small_image ?? assets.small_image),
    small_text: text(r.small_text ?? assets.small_text, 128),
    source: opts.source,
    application_id: opts.applicationId ?? null,
    expires_at: new Date(Date.now() + (opts.ttlMs ?? ACTIVITY_TTL_MS)).toISOString(),
  };
}

/** Collect live activity entries out of a presence-state snapshot. */
export function flattenPresenceActivity(
  state: Record<string, { userId?: unknown; activity?: unknown }[] | undefined>,
): ActivityMap {
  const map: ActivityMap = new Map();
  for (const key of Object.keys(state)) {
    for (const entry of state[key] ?? []) {
      if (entry && typeof entry.userId === "string") {
        map.set(entry.userId, (entry.activity as Activity | null | undefined) ?? null);
      }
    }
  }
  return map;
}

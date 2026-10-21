import type { Profile, ServerPermissionKey } from "@/lib/supabase/types";
import { displayName } from "@/lib/utils";

/*
 Built-in moderation commands for the composer: /ban, /kick and /timeout.

 Each command is a list of typed options. The composer turns a picked
 command into Discord-style option chips (name on the left, value on the
 right), shows the focused option's description above the box, and offers a
 member or duration picker where the option needs one.
*/

export type SlashOptionKind = "user" | "duration" | "text";

export interface SlashOption {
  name: string;
  description: string;
  kind: SlashOptionKind;
  required: boolean;
}

export interface SlashCommand {
  name: "ban" | "kick" | "timeout";
  description: string;
  permission: ServerPermissionKey;
  options: SlashOption[];
  /** Past tense for the confirmation, e.g. "was banned". */
  done: string;
}

const REASON_HINT = "Optional. If you give one, @disband DMs it to them.";

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: "ban",
    description: "Ban a user from the space",
    permission: "ban",
    done: "was banned",
    options: [
      { name: "user", description: "The user to ban", kind: "user", required: true },
      { name: "reason", description: `Why they're being banned. ${REASON_HINT}`, kind: "text", required: false },
    ],
  },
  {
    name: "kick",
    description: "Kick a user from the space",
    permission: "kick",
    done: "was kicked",
    options: [
      { name: "user", description: "The user to kick", kind: "user", required: true },
      { name: "reason", description: `Why they're being kicked. ${REASON_HINT}`, kind: "text", required: false },
    ],
  },
  {
    name: "timeout",
    description: "Time a user out",
    permission: "timeout_members",
    done: "was timed out",
    options: [
      { name: "user", description: "The user to time out", kind: "user", required: true },
      { name: "duration", description: "How long, like 1d1h1m. Up to 28 days.", kind: "duration", required: true },
      { name: "reason", description: `Why they're being timed out. ${REASON_HINT}`, kind: "text", required: false },
    ],
  },
];

/** Discord's own preset lengths, offered while the duration chip is focused. */
export const DURATION_PRESETS: { value: string; label: string }[] = [
  { value: "60s", label: "60 seconds" },
  { value: "5m", label: "5 minutes" },
  { value: "10m", label: "10 minutes" },
  { value: "1h", label: "1 hour" },
  { value: "1d", label: "1 day" },
  { value: "7d", label: "1 week" },
];

export const MAX_TIMEOUT_SECONDS = 28 * 86400;

/** "1d1h1m" → seconds. Units must come in d, h, m, s order; 0 if invalid. */
export function parseDuration(input: string): number {
  const v = input.trim();
  const m = v.match(/^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (!m || !v) return 0;
  const total =
    parseInt(m[1] || "0", 10) * 86400 +
    parseInt(m[2] || "0", 10) * 3600 +
    parseInt(m[3] || "0", 10) * 60 +
    parseInt(m[4] || "0", 10);
  return total > 0 ? total : 0;
}

/** Seconds → "1 day 2 hours", for confirmations. */
export function formatDuration(seconds: number): string {
  const parts: string[] = [];
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d) parts.push(unit(d, "day"));
  if (h) parts.push(unit(h, "hour"));
  if (m) parts.push(unit(m, "minute"));
  if (s && !d && !h) parts.push(unit(s, "second"));
  return parts.join(" ");
}

/**
 Members matching what was typed into a user chip or after an "@": username
 first (exact, then prefix), then display name. Both are searched, so typing
 "tev" finds the member whose display name is Tev even if their username is
 something else entirely.
*/
export function rankMembers<P extends Pick<Profile, "id" | "username" | "display_name">>(
  members: P[],
  query: string,
  limit = 8,
): P[] {
  const q = query.trim().replace(/^@/, "").toLowerCase();
  const scored: { m: P; score: number }[] = [];
  for (const m of members) {
    if (!m.username) continue;
    const u = m.username.toLowerCase();
    const d = displayName(m).toLowerCase();
    let score = -1;
    if (q === "") score = 5;
    else if (u === q) score = 0;
    else if (d === q) score = 1;
    else if (u.startsWith(q)) score = 2;
    else if (d.startsWith(q)) score = 3;
    else if (u.includes(q) || d.includes(q)) score = 4;
    if (score >= 0) scored.push({ m, score });
  }
  scored.sort((a, b) => a.score - b.score || displayName(a.m).localeCompare(displayName(b.m)));
  return scored.slice(0, limit).map((s) => s.m);
}

/**
 The member a typed user value means, when it is unambiguous: an exact
 username, or an exact display name only one member has.
*/
export function resolveMember<P extends Pick<Profile, "id" | "username" | "display_name">>(
  members: P[],
  typed: string,
): P | null {
  const q = typed.trim().replace(/^@/, "").toLowerCase();
  if (!q) return null;
  const byUsername = members.find((m) => m.username?.toLowerCase() === q);
  if (byUsername) return byUsername;
  const byName = members.filter((m) => displayName(m).toLowerCase() === q);
  return byName.length === 1 ? byName[0] : null;
}

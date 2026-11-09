/**
 * Bruce's toolkit: what every command gets (the context), how replies go out,
 * and small helpers (embeds, durations, finding members).
 *
 * A command runs the same way whether it came as a slash command or as a
 * prefix message ("!ban @kai spamming"): its declared options are filled from
 * the slash options, or from the words after the command, in order, with the
 * last text option taking the rest of the line.
 */

import type { CommandOption, ActionRow } from "@/lib/bot-commands";
import type { getServiceSupabase } from "@/lib/supabase/server";

export type Service = NonNullable<ReturnType<typeof getServiceSupabase>>;

export type Category =
  | "Info"
  | "Moderation"
  | "Tickets"
  | "Config"
  | "Levels"
  | "Economy"
  | "Fun"
  | "Social"
  | "Text"
  | "Utility"
  | "Tags";

/** Server permissions as user_has_server_permission() names them. */
export type Perm = "kick" | "ban" | "timeout_members" | "manage_messages" | "manage_server" | "manage_channels" | "manage_roles";

export interface Embed {
  title?: string;
  description?: string;
  color?: number;
  url?: string;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
  thumbnail?: { url: string };
  author?: { name: string; icon_url?: string };
}

export interface Reply {
  content?: string;
  embeds?: Embed[];
  components?: ActionRow[];
  /** Interaction replies only: replace the message whose button was pressed. */
  update?: boolean;
  /** Interaction replies only: just the person who ran it sees this. */
  ephemeral?: boolean;
}

export interface Person {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export interface Guild {
  server_id: string;
  prefix: string;
  ticket_category_id: string | null;
  ticket_support_role_id: string | null;
  ticket_log_channel_id: string | null;
  mod_log_channel_id: string | null;
  levels_enabled: boolean;
  level_up_messages: boolean;
}

export type OptValue = string | number | boolean | undefined;

export interface Ctx {
  service: Service;
  botId: string;
  botUserId: string;
  serverId: string;
  channelId: string;
  user: Person;
  guild: Guild;
  /** Filled options, by name. */
  opt: Record<string, OptValue>;
  /** How it was run, for help text. */
  via: "slash" | "prefix";
  /** The command name as typed (an alias, maybe). */
  invoked: string;
  can: (perm: Perm) => Promise<boolean>;
  /** Find a member of this space from "@name", a username or an id. */
  member: (ref: OptValue) => Promise<Person | null>;
  /** Send another message in the channel (beyond the reply). */
  send: (channelId: string, reply: Reply | string) => Promise<void>;
}

export type Result = Reply | string | null | void;

export interface Command {
  name: string;
  aliases?: string[];
  category: Category;
  description: string;
  options?: CommandOption[];
  /** Offered as a slash command (there is room for 100). */
  slash?: boolean;
  /** Needed by whoever runs it. */
  perm?: Perm;
  run: (ctx: Ctx) => Promise<Result> | Result;
}

// --- Look -------------------------------------------------------------------

export const COLOR = {
  brand: 0x4641d9,
  ok: 0x23a55a,
  warn: 0xf0b232,
  bad: 0xf23f43,
  gold: 0xffc83d,
  info: 0x5865f2,
} as const;

export function embed(e: Embed): Reply {
  return { embeds: [{ color: COLOR.brand, ...e }] };
}

export const ok = (text: string): Reply => embed({ description: `✅ ${text}`, color: COLOR.ok });
// Errors are private: only the person who ran the command sees them.
export const fail = (text: string): Reply => ({ ...embed({ description: `❌ ${text}`, color: COLOR.bad }), ephemeral: true });
/** A private success note, for things only the runner needs to know. */
export const okPrivate = (text: string): Reply => ({ ...embed({ description: `✅ ${text}`, color: COLOR.ok }), ephemeral: true });
/** A link to a channel that works even before the reader's app has loaded it. */
export const channelLink = (id: string) => `<#${id}>`;
export const info = (title: string, description: string): Reply => embed({ title, description });

// --- Options ------------------------------------------------------------------

export const o = {
  str: (name: string, description: string, required = true, choices?: string[]): CommandOption => ({
    name, description, type: "string", required, ...(choices ? { choices: choices.map((c) => ({ name: c, value: c })) } : {}),
  }),
  int: (name: string, description: string, required = true): CommandOption => ({ name, description, type: "integer", required }),
  num: (name: string, description: string, required = true): CommandOption => ({ name, description, type: "number", required }),
  user: (name: string, description: string, required = true): CommandOption => ({ name, description, type: "user", required }),
  channel: (name: string, description: string, required = true): CommandOption => ({ name, description, type: "channel", required }),
  bool: (name: string, description: string, required = true): CommandOption => ({ name, description, type: "boolean", required }),
};

/** Fill a command's options from the words typed after it. */
export function optionsFromWords(options: CommandOption[] = [], rest: string): Record<string, OptValue> {
  const out: Record<string, OptValue> = {};
  let remaining = rest.trim();
  options.forEach((def, i) => {
    if (!remaining) return;
    const isLast = i === options.length - 1;
    let word: string;
    if (def.type === "string" && isLast) {
      word = remaining;
      remaining = "";
    } else {
      const quoted = remaining.match(/^"([^"]*)"\s*/);
      if (quoted) {
        word = quoted[1];
        remaining = remaining.slice(quoted[0].length);
      } else {
        const m = remaining.match(/^(\S+)\s*/);
        word = m ? m[1] : remaining;
        remaining = remaining.slice(m ? m[0].length : remaining.length);
      }
    }
    if (def.type === "integer") {
      const n = parseInt(word, 10);
      out[def.name] = Number.isFinite(n) ? n : undefined;
    } else if (def.type === "number") {
      const n = Number(word);
      out[def.name] = Number.isFinite(n) ? n : undefined;
    } else if (def.type === "boolean") {
      out[def.name] = /^(on|yes|true|1|enable|enabled)$/i.test(word);
    } else if (def.type === "channel") {
      out[def.name] = word.replace(/^<#|>$/g, "").replace(/^#/, "");
    } else {
      out[def.name] = word;
    }
  });
  return out;
}

export function missing(cmd: Command, opt: Record<string, OptValue>): string | null {
  const need = (cmd.options ?? []).find((d) => d.required && (opt[d.name] === undefined || opt[d.name] === ""));
  return need ? need.name : null;
}

export function usage(cmd: Command, prefix: string): string {
  const parts = (cmd.options ?? []).map((d) => (d.required ? `<${d.name}>` : `[${d.name}]`));
  return `${prefix}${cmd.name}${parts.length ? " " + parts.join(" ") : ""}`;
}

// --- Words and numbers -----------------------------------------------------------

export const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];
export const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
export const fmt = (n: number | bigint) => Number(n).toLocaleString("en-GB");
export const nameOf = (p: Person | null | undefined) => p?.display_name || p?.username || "someone";
export const mention = (p: Person | null | undefined) => (p?.username ? `@${p.username}` : nameOf(p));
export const str = (v: OptValue) => (v === undefined ? "" : String(v));
export const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** "10m", "2h", "1d 3h", "90" (minutes) → minutes. */
export function parseDuration(input: OptValue): number | null {
  const s = str(input).trim().toLowerCase();
  if (!s) return null;
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  let total = 0;
  let matched = false;
  for (const m of s.matchAll(/(\d+)\s*(w|d|h|m|s)/g)) {
    matched = true;
    const n = parseInt(m[1], 10);
    total += m[2] === "w" ? n * 10080 : m[2] === "d" ? n * 1440 : m[2] === "h" ? n * 60 : m[2] === "m" ? n : n / 60;
  }
  return matched ? Math.max(1, Math.round(total)) : null;
}

export function humanMinutes(min: number): string {
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"}`;
  if (min < 1440) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h} hour${h === 1 ? "" : "s"}${m ? ` ${m} min` : ""}`;
  }
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  return `${d} day${d === 1 ? "" : "s"}${h ? ` ${h} h` : ""}`;
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return "unknown";
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d < 365 ? `${d} day${d === 1 ? "" : "s"} ago` : `${(d / 365).toFixed(1)} years ago`;
}

export function dateLong(iso: string | null | undefined): string {
  if (!iso) return "unknown";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

// --- Levels -------------------------------------------------------------------------

/** XP needed to go from `level` to the next, as the well-known curve. */
export const xpForNext = (level: number) => 5 * level * level + 50 * level + 100;

export function levelFromXp(xp: number): { level: number; into: number; need: number } {
  let level = 0;
  let left = xp;
  while (left >= xpForNext(level)) {
    left -= xpForNext(level);
    level += 1;
  }
  return { level, into: left, need: xpForNext(level) };
}

export function bar(fraction: number, width = 12): string {
  const filled = Math.round(Math.min(1, Math.max(0, fraction)) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

// --- Data ------------------------------------------------------------------------------

export async function memberRow(ctx: Pick<Ctx, "service" | "serverId">, userId: string) {
  const { data } = await ctx.service
    .from("bruce_members")
    .select("*")
    .eq("server_id", ctx.serverId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data ?? {
    server_id: ctx.serverId, user_id: userId, xp: 0, level: 0, messages: 0, coins: 0, bank: 0, rep: 0,
    last_xp_at: null, last_daily: null, last_work: null, last_rep_at: null, afk_reason: null, afk_since: null,
  }) as {
    server_id: string; user_id: string; xp: number; level: number; messages: number; coins: number; bank: number; rep: number;
    last_xp_at: string | null; last_daily: string | null; last_work: string | null; last_rep_at: string | null;
    afk_reason: string | null; afk_since: string | null;
  };
}

export async function addCoins(ctx: Pick<Ctx, "service" | "serverId">, userId: string, coins: number, bank = 0) {
  const { data, error } = await ctx.service.rpc("bruce_add_coins", {
    p_server_id: ctx.serverId, p_user_id: userId, p_coins: coins, p_bank: bank,
  });
  if (error) throw new Error(error.message.includes("Not enough") ? "You don't have enough coins." : error.message);
  return data as { coins: number; bank: number };
}

/** Run a bot RPC as Bruce; returns the error text, or null. */
export async function botCall(ctx: Pick<Ctx, "service" | "botId">, fn: string, args: Record<string, unknown>): Promise<string | null> {
  const { error } = await ctx.service.rpc(fn, { p_bot_id: ctx.botId, ...args });
  return error ? friendly(error.message) : null;
}

export function friendly(message: string): string {
  if (/needs the \w+ role permission/i.test(message)) {
    return "I need a role with **Administrator** for that. The owner can give me one in Space Settings → Roles, or re-add me and tick \"Give it Administrator\".";
  }
  if (/does not have|scope/i.test(message)) return "I wasn't given that permission when I was added to this space. Re-add me with it ticked.";
  if (/above|higher|hierarchy|top role/i.test(message)) return "That's above my highest role, so I can't touch it.";
  if (/owner|moderator|another bot/i.test(message)) return "I can't do that to the owner, moderators or other bots.";
  return message;
}

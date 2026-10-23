import { useSyncExternalStore } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

/** The eight built-in pixel icons. Keep this list in sync with 0162. */
export const GUILD_TAG_ICON_IDS = [
  "star",
  "heart",
  "bolt",
  "crown",
  "skull",
  "moon",
  "leaf",
  "flame",
] as const;

export type GuildTagIcon = (typeof GUILD_TAG_ICON_IDS)[number];

export const GUILD_TAG_ICONS: ReadonlyArray<{ id: GuildTagIcon; label: string }> = [
  { id: "star", label: "Star" },
  { id: "heart", label: "Heart" },
  { id: "bolt", label: "Bolt" },
  { id: "crown", label: "Crown" },
  { id: "skull", label: "Skull" },
  { id: "moon", label: "Moon" },
  { id: "leaf", label: "Leaf" },
  { id: "flame", label: "Flame" },
];

/** A compact palette for the common choices; the picker also accepts any hex. */
export const GUILD_TAG_COLORS = [
  "#5865f2",
  "#eb459e",
  "#f23f43",
  "#f0b232",
  "#23a55a",
  "#00a8fc",
  "#9b59b6",
  "#e67e22",
] as const;

export interface GuildTag {
  server_id: string;
  tag: string;
  icon: GuildTagIcon;
  color: string;
  is_private?: boolean;
}

export interface GuildTagOption extends GuildTag {
  server_name: string;
  server_icon_url: string | null;
  equipped: boolean;
}

export type GuildTagSpace =
  | { private: true }
  | {
      private: false;
      server_id: string;
      name: string;
      icon_url: string | null;
      banner_url: string | null;
      description: string | null;
      verified: boolean;
      partner: boolean;
      discoverable: boolean;
      joined: boolean;
      member_count: number;
      online_count: number;
    };

function isIcon(value: unknown): value is GuildTagIcon {
  return typeof value === "string" && (GUILD_TAG_ICON_IDS as readonly string[]).includes(value);
}

function normalizeColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  return match ? `#${match[1].toLowerCase()}` : null;
}

/** Uppercase, strip anything outside the allowed grammar, and cap at 4. */
export function sanitizeGuildTag(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9_.-]/g, "")
    .slice(0, 4);
}

export function guildTagError(raw: string): string | null {
  const tag = sanitizeGuildTag(raw);
  if (!tag) return "Enter 1–4 letters, numbers, dots, underscores or hyphens.";
  if (!/^[A-Z0-9_.-]{1,4}$/.test(tag)) return "Use only letters, numbers, dots, underscores or hyphens.";
  return null;
}

export function normalizeGuildTagColor(raw: string): string | null {
  return normalizeColor(raw);
}

/**
 * Pick a foreground that stays readable on an arbitrary tag colour. Dark
 * badges get white ink, light badges get near-black ink.
 */
export function guildTagForeground(raw: string): string {
  const color = normalizeColor(raw) ?? "#5865f2";
  const value = Number.parseInt(color.slice(1), 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return luminance > 0.179 ? "#111214" : "#ffffff";
}

export function asGuildTag(value: unknown): GuildTag | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const serverId = typeof row.server_id === "string" ? row.server_id : null;
  const tag = typeof row.tag === "string" ? row.tag : null;
  const icon = isIcon(row.icon) ? row.icon : null;
  const color = normalizeColor(row.color);
  if (!serverId || !tag || !icon || !color) return null;
  return {
    server_id: serverId,
    tag,
    icon,
    color,
    is_private: row.is_private === true,
  };
}

export async function fetchServerGuildTag(serverId: string): Promise<{ tag: GuildTag | null; error: string | null }> {
  const { data, error } = await getSupabaseClient()
    .from("server_guild_tags")
    .select("server_id, tag, icon, color, is_private")
    .eq("server_id", serverId)
    .maybeSingle();

  if (error) return { tag: null, error: error.message };
  return { tag: asGuildTag(data), error: null };
}

export async function fetchMyGuildTagOptions(): Promise<{ options: GuildTagOption[]; error: string | null }> {
  const { data, error } = await getSupabaseClient().rpc("get_my_guild_tags");
  if (error) return { options: [], error: error.message };

  const options = (Array.isArray(data) ? data : []).flatMap((row) => {
    const tag = asGuildTag(row);
    if (!tag) return [];
    const record = row as Record<string, unknown>;
    return [{
      ...tag,
      server_name: typeof record.server_name === "string" ? record.server_name : "Space",
      server_icon_url: typeof record.server_icon_url === "string" ? record.server_icon_url : null,
      equipped: record.equipped === true,
    }];
  });

  return { options, error: null };
}

export async function saveServerGuildTag(
  serverId: string,
  input: { tag: string; icon: GuildTagIcon; color: string; isPrivate?: boolean },
): Promise<{ tag: GuildTag | null; error: string | null }> {
  const tag = sanitizeGuildTag(input.tag);
  const color = normalizeGuildTagColor(input.color);
  const tagProblem = guildTagError(tag);
  if (tagProblem) return { tag: null, error: tagProblem };
  if (!color) return { tag: null, error: "Pick a valid six-digit colour." };
  if (!isIcon(input.icon)) return { tag: null, error: "Pick one of the eight icons." };

  const { data, error } = await getSupabaseClient().rpc("set_server_guild_tag", {
    p_server_id: serverId,
    p_tag: tag,
    p_icon: input.icon,
    p_color: color,
    p_private: input.isPrivate === true,
  });

  if (error) return { tag: null, error: error.message };
  return { tag: asGuildTag(data), error: null };
}

export async function fetchGuildTagSpace(serverId: string): Promise<{ space: GuildTagSpace | null; error: string | null }> {
  const { data, error } = await getSupabaseClient().rpc("get_guild_tag_space", {
    p_server_id: serverId,
  });
  if (error) return { space: null, error: error.message };
  if (!data || typeof data !== "object") return { space: null, error: "Could not load that space." };

  const row = data as Record<string, unknown>;
  if (row.private === true) return { space: { private: true }, error: null };

  const shape = (value: unknown) => (typeof value === "string" ? value : null);
  const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
  const server = {
    private: false as const,
    server_id: shape(row.server_id) ?? serverId,
    name: shape(row.name) ?? "Space",
    icon_url: shape(row.icon_url),
    banner_url: shape(row.banner_url),
    description: shape(row.description),
    verified: row.verified === true,
    partner: row.partner === true,
    discoverable: row.discoverable === true,
    joined: row.joined === true,
    member_count: count(row.member_count),
    online_count: count(row.online_count),
  };
  return { space: server, error: null };
}

/*
 A tag can be clicked anywhere it is rendered. The modal is mounted once by
 the app shell; this tiny store lets a badge open it without threading a
 callback through every name row or re-rendering the whole app.
*/
let openGuildTagServerId: string | null = null;
const guildTagModalListeners = new Set<() => void>();

function notifyGuildTagModal() {
  for (const listener of guildTagModalListeners) listener();
}

export function showGuildTagSpace(serverId: string) {
  if (!serverId) return;
  openGuildTagServerId = serverId;
  notifyGuildTagModal();
}

export function hideGuildTagSpace() {
  openGuildTagServerId = null;
  notifyGuildTagModal();
}

export function useGuildTagSpaceServerId(): string | null {
  return useSyncExternalStore(
    (listener) => {
      guildTagModalListeners.add(listener);
      return () => guildTagModalListeners.delete(listener);
    },
    () => openGuildTagServerId,
    () => null,
  );
}

export async function removeServerGuildTag(serverId: string): Promise<string | null> {
  const { error } = await getSupabaseClient().rpc("remove_server_guild_tag", {
    p_server_id: serverId,
  });
  return error?.message ?? null;
}

export async function equipGuildTag(serverId: string): Promise<{ tag: GuildTag | null; error: string | null }> {
  const { data, error } = await getSupabaseClient().rpc("equip_guild_tag", {
    p_server_id: serverId,
  });
  if (error) return { tag: null, error: error.message };
  return { tag: asGuildTag(data), error: null };
}

export async function clearGuildTag(): Promise<string | null> {
  const { error } = await getSupabaseClient().rpc("clear_guild_tag");
  return error?.message ?? null;
}

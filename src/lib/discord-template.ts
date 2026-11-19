/*
 Discord server templates (discord.new/CODE) mapped onto a Disband space.

 A template is public: GET https://discord.com/api/v10/guilds/templates/CODE
 returns the source server's roles, categories, channels and channel
 permission overwrites (no members, messages or emoji). This turns that into
 the shape create_server_from_template takes.

 What carries over:
   roles        name, colour, order, and every permission Disband has
   categories   name and order
   channels     text, announcement (as text), voice, stage, forum and media
                (as forum); name, topic, slow mode, user limit, forum tags
   overwrites   per role: view, send, react and attach, allowed or denied
 What doesn't: emoji, stickers, webhooks, AutoMod, onboarding, role icons,
 and anything Disband has no setting for.
*/

export type TemplateChannelType = "text" | "voice" | "forum";

export interface TemplateOverwrite {
  /** "everyone" for @everyone, otherwise a role key. */
  role: string;
  view: boolean | null;
  post: boolean | null;
  react: boolean | null;
  attach: boolean | null;
}

export interface TemplateRole {
  key: string;
  name: string;
  color: string;
  position: number;
  permissions: Record<string, boolean>;
}

export interface TemplateCategory {
  key: string;
  name: string;
  position: number;
}

export interface TemplateChannel {
  key: string;
  name: string;
  type: TemplateChannelType;
  stage: boolean;
  category: string | null;
  position: number;
  topic: string | null;
  slow_mode: number;
  user_limit: number | null;
  tags: string[];
  overwrites: TemplateOverwrite[];
}

export interface DisbandTemplate {
  everyone: Record<string, boolean>;
  roles: TemplateRole[];
  categories: TemplateCategory[];
  channels: TemplateChannel[];
}

export interface TemplatePreview {
  code: string;
  /** The template's own name, e.g. "Gaming community". */
  title: string;
  /** The source server's name, used as the default space name. */
  serverName: string;
  description: string | null;
  template: DisbandTemplate;
  counts: { roles: number; categories: number; channels: number };
}

/** "discord.new/abc", "https://discord.com/template/abc", or just "abc". */
export function parseTemplateCode(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const m =
    s.match(/discord\.new\/([A-Za-z0-9-]{2,64})/i) ??
    s.match(/discord(?:app)?\.com\/template\/([A-Za-z0-9-]{2,64})/i) ??
    s.match(/^([A-Za-z0-9-]{6,64})$/);
  return m ? m[1] : null;
}

/** Looks like a Discord template link (as opposed to a Disband invite). */
export function looksLikeTemplateLink(input: string): boolean {
  return /discord\.new\/|discord(?:app)?\.com\/template\//i.test(input);
}

// Discord permission bits → Disband role permissions.
const BIT = (n: number) => BigInt(1) << BigInt(n);
const ROLE_BITS: [string, bigint][] = [
  ["create_invites", BIT(0)],
  ["kick", BIT(1)],
  ["ban", BIT(2)],
  ["administrator", BIT(3)],
  ["manage_channels", BIT(4)],
  ["manage_server", BIT(5)],
  ["add_reactions", BIT(6)],
  ["view_audit_log", BIT(7)],
  ["send_messages", BIT(11)],
  ["manage_messages", BIT(13)],
  ["attach_files", BIT(15)],
  ["mention_everyone", BIT(17)],
  ["manage_roles", BIT(28)],
  ["manage_webhooks", BIT(29)],
  ["manage_emojis", BIT(30)],
  ["timeout_members", BIT(40)],
  ["pin_messages", BIT(51)],
];
const VIEW = BIT(10);
const SEND = BIT(11);
const REACT = BIT(6);
const ATTACH = BIT(15);
const MANAGE_MESSAGES = BIT(13);

function bits(v: unknown): bigint {
  try {
    if (typeof v === "string" && /^\d+$/.test(v)) return BigInt(v);
    if (typeof v === "number" && Number.isFinite(v)) return BigInt(Math.trunc(v));
  } catch {
    // fall through
  }
  return BigInt(0);
}

function rolePermissions(raw: unknown): Record<string, boolean> {
  const b = bits(raw);
  const out: Record<string, boolean> = {};
  for (const [key, bit] of ROLE_BITS) out[key] = (b & bit) !== BigInt(0);
  // Pinning was part of Manage Messages until Discord split it out.
  if ((b & MANAGE_MESSAGES) !== BigInt(0)) out.pin_messages = true;
  return out;
}

function hex(color: unknown): string {
  const n = typeof color === "number" ? color : Number(color);
  if (!Number.isFinite(n) || n <= 0) return "#949ba4";
  return `#${Math.trunc(n).toString(16).padStart(6, "0").slice(-6)}`;
}

const clip = (s: unknown, max: number) =>
  typeof s === "string" ? s.trim().slice(0, max) : "";

interface RawRole { id: number | string; name?: string; color?: number; permissions?: string }
interface RawOverwrite { id: number | string; type?: number; allow?: string; deny?: string }
interface RawChannel {
  id: number | string;
  type: number;
  name?: string;
  position?: number;
  parent_id?: number | string | null;
  topic?: string | null;
  rate_limit_per_user?: number;
  user_limit?: number;
  permission_overwrites?: RawOverwrite[];
  available_tags?: { name?: string }[] | null;
}
interface RawTemplate {
  code?: string;
  name?: string;
  description?: string | null;
  serialized_source_guild?: {
    name?: string;
    description?: string | null;
    roles?: RawRole[];
    channels?: RawChannel[];
  };
}

/** Turn Discord's template response into what create_server_from_template takes. */
export function mapDiscordTemplate(raw: RawTemplate, code: string): TemplatePreview {
  const guild = raw.serialized_source_guild ?? {};
  const rawRoles = Array.isArray(guild.roles) ? guild.roles : [];
  const rawChannels = Array.isArray(guild.channels) ? guild.channels : [];

  // @everyone is role id 0 in a template; the rest are numbered bottom-up,
  // so a higher id is a higher role, as a higher position is in Disband.
  const everyoneRaw = rawRoles.find((r) => String(r.id) === "0");
  const others = rawRoles
    .filter((r) => String(r.id) !== "0")
    .sort((a, b) => Number(a.id) - Number(b.id))
    .slice(-250);
  const roles: TemplateRole[] = others.map((r, i) => ({
    key: String(r.id),
    name: clip(r.name, 100) || "role",
    color: hex(r.color),
    position: i + 1,
    permissions: rolePermissions(r.permissions),
  }));
  const roleKeys = new Set(roles.map((r) => r.key));

  const categories: TemplateCategory[] = rawChannels
    .filter((c) => c.type === 4)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .slice(0, 50)
    .map((c, i) => ({ key: String(c.id), name: clip(c.name, 100) || "category", position: i }));
  const categoryKeys = new Set(categories.map((c) => c.key));

  const tri = (allow: bigint, deny: bigint, bit: bigint): boolean | null =>
    (allow & bit) !== BigInt(0) ? true : (deny & bit) !== BigInt(0) ? false : null;

  // Discord lists voice below text within a category whatever the positions.
  const voiceLast = (c: RawChannel) => (c.type === 2 || c.type === 13 ? 1 : 0);
  const supported = rawChannels
    .filter((c) => [0, 2, 5, 13, 15, 16].includes(c.type))
    .sort((a, b) => voiceLast(a) - voiceLast(b) || (a.position ?? 0) - (b.position ?? 0) || Number(a.id) - Number(b.id))
    .slice(0, 500);

  // Positions restart at 0 inside each category, as Disband orders them.
  const nextPos = new Map<string, number>();
  const channels: TemplateChannel[] = supported.map((c) => {
    const type: TemplateChannelType = c.type === 2 || c.type === 13 ? "voice" : c.type === 15 || c.type === 16 ? "forum" : "text";
    const parent = c.parent_id != null && categoryKeys.has(String(c.parent_id)) ? String(c.parent_id) : null;
    const slot = parent ?? "";
    const position = nextPos.get(slot) ?? 0;
    nextPos.set(slot, position + 1);

    const overwrites: TemplateOverwrite[] = [];
    for (const o of c.permission_overwrites ?? []) {
      if (o.type !== undefined && o.type !== 0) continue; // member overwrites don't exist in templates
      const id = String(o.id);
      const role = id === "0" ? "everyone" : roleKeys.has(id) ? id : null;
      if (!role) continue;
      const allow = bits(o.allow);
      const deny = bits(o.deny);
      const ow: TemplateOverwrite = {
        role,
        view: tri(allow, deny, VIEW),
        post: type === "voice" ? null : tri(allow, deny, SEND),
        react: tri(allow, deny, REACT),
        attach: type === "voice" ? null : tri(allow, deny, ATTACH),
      };
      if (ow.view !== null || ow.post !== null || ow.react !== null || ow.attach !== null) overwrites.push(ow);
    }

    const limit = Number(c.user_limit ?? 0);
    return {
      key: String(c.id),
      name: clip(c.name, 100) || (type === "voice" ? "voice" : "channel"),
      type,
      stage: c.type === 13,
      category: parent,
      position,
      topic: type === "voice" ? null : clip(c.topic, 1024) || null,
      slow_mode: Math.min(Math.max(Math.trunc(Number(c.rate_limit_per_user ?? 0)) || 0, 0), 21600),
      user_limit: type === "voice" && limit >= 1 ? Math.min(limit, 99) : null,
      tags:
        type === "forum"
          ? (c.available_tags ?? [])
              .map((t) => clip(t?.name, 24))
              .filter((t) => t.length > 0)
              .slice(0, 20)
          : [],
      overwrites,
    };
  });

  return {
    code,
    title: clip(raw.name, 100) || "Discord template",
    serverName: clip(guild.name, 32) || clip(raw.name, 32) || "My space",
    description: clip(raw.description ?? guild.description, 190) || null,
    template: {
      everyone: rolePermissions(everyoneRaw?.permissions ?? "0"),
      roles,
      categories,
      channels,
    },
    counts: { roles: roles.length, categories: categories.length, channels: channels.length },
  };
}

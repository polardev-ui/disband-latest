import { PUBLIC_ENV } from "./public-env";

export function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  // The reader's locale, as the date dividers use: a fixed en-US date put
  // 03/04 for the 3rd of April in front of readers who read it as 3 April
  // beside a divider that said 3 April.
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (isToday) return `Today at ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday at ${time}`;
  return d.toLocaleDateString(undefined, { month: "2-digit", day: "2-digit", year: "numeric" }) + ` ${time}`;
}

/** Usernames named by @mentions, in first-seen order, without duplicates. */
export function parseMentionTokens(content: string): string[] {
  const tokens = new Set<string>();
  const re = /@([a-zA-Z0-9_]{1,32})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    // Don't treat the domain in an email address as an @mention.
    if (m.index > 0 && /[\w.]/.test(content[m.index - 1])) continue;
    const token = m[1].toLowerCase();
    if (token === "everyone") continue;
    tokens.add(token);
    if (tokens.size >= 100) break;
  }
  return [...tokens];
}

/**
 * The stable part of a role mention: "@&Staff" and "@&Server-Moderator".
 *
 * Roles and users can share a name, so a role pick must never emit the same
 * token as the member mention. The ampersand keeps the two namespaces apart;
 * the slug lets the token survive spaces and punctuation without quoting.
 */
export function roleMentionSlug(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Role slugs named by @&mentions, in first-seen order, without duplicates. */
export function parseRoleMentionTokens(content: string): string[] {
  const tokens = new Set<string>();
  const re = /@&([a-zA-Z0-9_-]{1,64})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m[1]) tokens.add(m[1].toLowerCase());
    if (tokens.size >= 20) break;
  }
  return [...tokens];
}

export function parseMentions(
  content: string,
  members: { id: string; username: string | null }[],
  authorId?: string,
): string[] {
  const ids = new Set<string>();
  for (const token of parseMentionTokens(content)) {
    const user = members.find((u) => u.username?.toLowerCase() === token);
    if (user) ids.add(user.id);
  }

  void authorId;
  return [...ids];
}

export function mentionsEveryone(content: string): boolean {
  return /@everyone\b/i.test(content);
}

export function mentionsUsername(content: string, username: string | null | undefined): boolean {
  if (!username) return false;
  const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`@${escaped}\\b`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m.index === 0 || !/[\w.]/.test(content[m.index - 1])) return true;
  }
  return false;
}

export function isValidMentionToken(
  token: string,
  members: { username: string | null }[],
): boolean {
  if (token.toLowerCase() === "everyone") return true;
  return members.some((m) => m.username?.toLowerCase() === token.toLowerCase());
}

export function normalizeMessageContent(content: string): string {
  const text = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // Keep intentional blank lines from Shift+Enter. Only trailing blank lines
  // are removed; collapsing every run of newlines made the composer show
  // spacing that disappeared the moment the message was sent.
  const lines = text.split("\n");
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }
  return lines.join("\n");
}

export function getMentionQuery(text: string, cursor: number): { start: number; query: string } | null {
  const before = text.slice(0, cursor);
  const match = before.match(/@([a-zA-Z0-9_-]*)$/);
  if (!match) return null;
  return { start: cursor - match[0].length, query: match[1] };
}

export function getEmojiQuery(text: string, cursor: number): { start: number; query: string } | null {
  const before = text.slice(0, cursor);
  const match = before.match(/:([a-zA-Z0-9_+\-]*)$/);
  if (!match) return null;
  return { start: cursor - match[0].length, query: match[1] };
}

export function getChannelQuery(text: string, cursor: number): { start: number; query: string } | null {
  const before = text.slice(0, cursor);
  const match = before.match(/#([a-zA-Z0-9_-]*)$/);
  if (!match) return null;
  return { start: cursor - match[0].length, query: match[1] };
}

export function getCompletedEmojiToken(text: string, cursor: number): { start: number; code: string } | null {
  const before = text.slice(0, cursor);
  const match = before.match(/:([a-zA-Z0-9_+\-]+):$/);
  if (!match) return null;
  return { start: cursor - match[0].length, code: match[1] };
}

export function displayName(p: {
  display_name?: string | null;
  username?: string | null;
}): string {
  return p.display_name || p.username || "Unknown";
}

export function initials(p: {
  display_name?: string | null;
  username?: string | null;
}): string {
  const name = displayName(p);
  return name.slice(0, 2).toUpperCase();
}

export function serverInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function shareableAppOrigin(): string {
  const web = PUBLIC_ENV.webAppUrl.replace(/\/$/, "");
  if (typeof window === "undefined") return web;
  const origin = window.location.origin;

  if (!/^https?:\/\//i.test(origin)) return web;
  let host: string;
  try {
    host = new URL(origin).hostname;
  } catch {
    return web;
  }
  // The desktop shell runs on tauri.localhost, which is not a shareable
  // address — an invite copied there would point at the user's own machine.
  if (host === "tauri.localhost") return web;
  // Invites read disband.dev/server/<code>. The bare host 308s to www with
  // the path intact, so the short form lands in the same place.
  try {
    const url = new URL(web);
    if (url.hostname === "www.disband.dev") url.hostname = "disband.dev";
    return url.origin;
  } catch {
    return web;
  }
}

export function getInviteUrl(code: string): string {
  return `${shareableAppOrigin()}/server/${code}`;
}

// Generated codes are 7 characters; custom (vanity) ones are 3–24 of a-z, 0-9
// and hyphens; links shared before October carry 32-character codes.
// Only Disband's own hosts (or a bare /server/ path) count, so a /server/
// path on some other site never turns into a join card.
const INVITE_RE = /(?:https?:\/\/(?:www\.)?disband\.dev|(?<![\w/.:-]))\/(?:server|invite)\/([a-zA-Z0-9-]{3,32})(?![\w-])/gi;
export const URL_RE = /https?:\/\/[^\s<>\[\]()]+[^\s<>\[\]().,;:!?'"`]/gi;

export function extractInviteCodes(text: string): string[] {
  const codes = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(INVITE_RE.source, "gi");
  while ((m = re.exec(text)) !== null) codes.add(m[1]);
  return [...codes];
}

export interface AvatarCrop {
  zoom: number;
  x: number;
  y: number;
}

export function avatarStyle(
  url: string | null | undefined,
  crop?: AvatarCrop | null,
): { objectFit: "cover"; objectPosition: string; transform: string; transformOrigin: string } | undefined {
  if (!url) return undefined;
  const zoom = crop?.zoom ?? 1;
  const x = crop?.x ?? 0;
  const y = crop?.y ?? 0;
  return {
    objectFit: "cover" as const,
    objectPosition: `${50 + x}% ${50 + y}%`,
    transform: `scale(${zoom})`,
    transformOrigin: `${50 + x}% ${50 + y}%`,
  };
}

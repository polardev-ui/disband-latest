import { PUBLIC_ENV } from "./public-env";

export function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (isToday) return `Today at ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday at ${time}`;
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }) + ` ${time}`;
}

/** Parse @username and @everyone mentions; return matched user IDs. */
export function parseMentions(
  content: string,
  members: { id: string; username: string | null }[],
  authorId?: string,
): string[] {
  const ids = new Set<string>();
  const re = /@([a-zA-Z0-9_]{2,32})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const token = m[1].toLowerCase();
    if (token === "everyone") continue;
    const user = members.find((u) => u.username?.toLowerCase() === token);
    if (user) ids.add(user.id);
  }
  // @everyone is deliberately NOT expanded into ids here.
  //
  // It used to be, from whatever members the sender's client happened to have
  // loaded — so in a server of a thousand people most of them were never in
  // the list and never saw the ping, and the sender never saw it either. It is
  // a property of the message text, so it is read from the text at render
  // time instead, where it is right for everyone regardless of who was loaded.
  void authorId;
  return [...ids];
}

/** True when a message addresses the whole channel. */
export function mentionsEveryone(content: string): boolean {
  return /@everyone\b/i.test(content);
}

/**
 * Whether a message pings `username` by name.
 *
 * Checked against the text rather than the stored id list because that list is
 * only as complete as the sender's loaded member list was — which is why a
 * direct ping sometimes failed to highlight.
 */
export function mentionsUsername(content: string, username: string | null | undefined): boolean {
  if (!username) return false;
  const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`@${escaped}\\b`, "i").test(content);
}

/** Whether @token should render as a mention (member exists, or @everyone with members). */
export function isValidMentionToken(
  token: string,
  members: { username: string | null }[],
): boolean {
  if (token.toLowerCase() === "everyone") return members.length > 0;
  return members.some((m) => m.username?.toLowerCase() === token.toLowerCase());
}

/** Remove trailing blank lines; collapse accidental double line breaks. */
export function normalizeMessageContent(content: string): string {
  let text = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  text = text.replace(/\n{2,}/g, "\n");
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

/** Emoji autocomplete: typing `:sob` (no closing colon yet) opens the picker. */
export function getEmojiQuery(text: string, cursor: number): { start: number; query: string } | null {
  const before = text.slice(0, cursor);
  const match = before.match(/:([a-zA-Z0-9_+\-]*)$/);
  if (!match) return null;
  return { start: cursor - match[0].length, query: match[1] };
}

/** Channel autocomplete: typing `#chan` (no space yet) opens the picker. */
export function getChannelQuery(text: string, cursor: number): { start: number; query: string } | null {
  const before = text.slice(0, cursor);
  const match = before.match(/#([a-zA-Z0-9_-]*)$/);
  if (!match) return null;
  return { start: cursor - match[0].length, query: match[1] };
}

/** Match a completed `:sob:` token immediately before the cursor, if any. */
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

/** Discord-style text channel slug: lowercase, hyphens, no spaces. */
export function normalizeChannelName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function shareableAppOrigin(): string {
  const web = PUBLIC_ENV.webAppUrl.replace(/\/$/, "");
  if (typeof window === "undefined") return web;
  const origin = window.location.origin;
  // Tauri (tauri://localhost) and other non-http origins can't produce shareable links.
  if (!/^https?:\/\//i.test(origin)) return web;
  return origin;
}

export function getInviteUrl(code: string): string {
  return `${shareableAppOrigin()}/server/${code}`;
}

// `/invite/` is accepted alongside `/server/` because the iOS app shared that
// spelling for a while. Case-insensitive so a capitalised "Https://" — which
// phone keyboards produce at the start of a message — still matches.
// Length covers generated 7-char codes and Level 1+ vanity slugs (3-24 chars).
const INVITE_RE = /(?:https?:\/\/[^\s]+)?\/(?:server|invite)\/([a-zA-Z0-9-]{3,32})\b/gi;
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

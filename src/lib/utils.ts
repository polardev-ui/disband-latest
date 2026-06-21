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

/** Parse @username mentions and return matched user IDs. */
export function parseMentions(
  content: string,
  members: { id: string; username: string | null }[],
): string[] {
  const ids = new Set<string>();
  const re = /@([a-zA-Z0-9_]{2,32})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const user = members.find(
      (u) => u.username?.toLowerCase() === m![1].toLowerCase(),
    );
    if (user) ids.add(user.id);
  }
  return [...ids];
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

export function getInviteUrl(code: string): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/server/${code}`;
  }
  return `https://disband-latest.vercel.app/server/${code}`;
}

const INVITE_RE = /(?:https?:\/\/[^\s]+)?\/server\/([a-zA-Z0-9]{7})\b/g;

export function extractInviteCodes(text: string): string[] {
  const codes = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(INVITE_RE.source, "g");
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

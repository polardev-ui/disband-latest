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

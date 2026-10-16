import type { ServerMember, ServerRole } from "@/lib/supabase/types";

/**
 * Role icons (Catalyst Level 2).
 *
 * `server_roles.icon` holds either a short emoji string or an https URL to an
 * uploaded image; the database rejects anything else
 * (0132_catalyst_perk_guard.sql).
 */

export const ROLE_ICON_EMOJI_MAX = 16;

export function isImageRoleIcon(icon: string | null | undefined): icon is string {
  return !!icon && /^https:\/\//i.test(icon);
}

/** A typed value trimmed and capped (in code points) like the database. */
export function cleanRoleIconEmoji(value: string): string {
  return Array.from(value.trim()).slice(0, ROLE_ICON_EMOJI_MAX).join("");
}

/** True when the value is an emoji (ZWJ sequences, skin tones and flags included). */
export function isEmojiRoleIcon(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  return /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|\u200d|\ufe0f|\u20e3|[#*0-9])+$/u.test(v)
    && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(v);
}

function memberRoleIds(member: Pick<ServerMember, "role_ids" | "role_id">): string[] {
  if (member.role_ids && member.role_ids.length > 0) return member.role_ids;
  return member.role_id ? [member.role_id] : [];
}

/**
 * The icon a member shows: the highest role they hold that has one, the same
 * rule Discord uses — so a member's icon can come from a role below the one
 * that colours their name.
 */
export function memberIconRole(
  member: Pick<ServerMember, "role_ids" | "role_id"> | null | undefined,
  roles: ServerRole[],
): ServerRole | null {
  if (!member) return null;
  let best: ServerRole | null = null;
  for (const id of memberRoleIds(member)) {
    const role = roles.find((r) => r.id === id);
    if (role?.icon && (!best || role.position > best.position)) best = role;
  }
  return best;
}

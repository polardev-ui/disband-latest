import type { Profile } from "@/lib/supabase/types";

export type AttachmentType = "image" | "video" | "gif" | "file" | "poll" | "audio" | "activity";
export type MessageContext = "channel" | "dm" | "group" | "notes";

export interface MessageAttachmentPayload {
  url: string;
  type: AttachmentType;
  key?: string;
  name?: string;
  size?: number;
}

export interface MessageSendOptions {
  attachment?: MessageAttachmentPayload;
  replyToId?: string | null;
  pendingFile?: File;
  /**
   * Several files on ONE message, up to MAX_ATTACHMENTS.
   *
   * The composer used to loop and send a message per file, which is why a
   * caption and its images arrived as separate messages. Takes precedence
   * over `pendingFile`, which stays for the single-file callers.
   */
  pendingFiles?: File[];
  maxUploadBytes?: number;
}

export interface MessageReaction {
  id: string;
  context_type: MessageContext;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface ReactionSummary {
  emoji: string;
  count: number;
  userIds: string[];
  reacted: boolean;
}

/**
 * The author fields a reply quote needs: enough for the name and the real
 * avatar (including its crop and profile colours). Reply targets can sit
 * outside the loaded message window, so they are fetched separately and only
 * these columns are carried around with the quote.
 */
export type ReplyAuthor = Pick<
  Profile,
  | "id"
  | "username"
  | "display_name"
  | "avatar_url"
  | "accent_color"
  | "accent_color_2"
  | "avatar_crop"
  | "equipped_ring_effect"
>;

export interface ReplyPreview {
  id: string;
  author_id: string | null;
  content: string;
  attachment_type?: AttachmentType | null;
  author?: ReplyAuthor;
  /**
   * The target isn't in the loaded window and its preview is still being
   * fetched. Callers render a neutral placeholder instead of claiming the
   * message was deleted: reply_to_id is nulled by the database when a target
   * really is deleted, so a non-null id never means "deleted".
   */
  pending?: boolean;
  // Only set when a lookup finished without returning the target (for
  // example, access was lost). Renders an unavailable fallback.
  deleted?: boolean;
}

/** Trim a full profile down to the fields a reply quote renders. */
export function toReplyAuthor(
  author: ReplyAuthor | Profile | null | undefined,
): ReplyAuthor | undefined {
  if (!author) return undefined;
  return {
    id: author.id,
    username: author.username,
    display_name: author.display_name,
    avatar_url: author.avatar_url ?? null,
    accent_color: author.accent_color ?? null,
    accent_color_2: author.accent_color_2 ?? null,
    avatar_crop: author.avatar_crop ?? null,
    equipped_ring_effect: author.equipped_ring_effect ?? null,
  };
}

export function summarizeReactions(
  reactions: MessageReaction[],
  messageId: string,
  currentUserId?: string | null,
): ReactionSummary[] {
  const map = new Map<string, ReactionSummary>();
  for (const r of reactions) {
    if (r.message_id !== messageId) continue;
    const existing = map.get(r.emoji) ?? { emoji: r.emoji, count: 0, userIds: [], reacted: false };
    existing.count += 1;
    existing.userIds.push(r.user_id);
    if (r.user_id === currentUserId) existing.reacted = true;
    map.set(r.emoji, existing);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export function matchesOptimisticRow(
  opt: {
    author_id: string | null;
    content: string;
    attachment_url?: string | null;
    reply_to_id?: string | null;
  },
  real: {
    author_id: string | null;
    content: string;
    attachment_url?: string | null;
    reply_to_id?: string | null;
  },
): boolean {
  return (
    opt.author_id === real.author_id
    && opt.content === real.content
    && (opt.attachment_url ?? null) === (real.attachment_url ?? null)
    && (opt.reply_to_id ?? null) === (real.reply_to_id ?? null)
  );
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n >= 10 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toUpperCase() : "FILE";
}

export interface MergeableMessageRow {
  id: string;
  created_at: string;
}

function byTime(a: MergeableMessageRow, b: MergeableMessageRow): number {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

/**
 * Add a live message to a rendered conversation without losing an in-flight
 * optimistic row. Used by both the fast catch-up poll and the Realtime
 * Broadcast path; they race with each other and with Postgres Changes, so
 * the id check makes every path idempotent.
 */
export function appendLiveMessage<
  Row extends MergeableMessageRow & {
    author_id: string | null;
    content: string;
    attachment_url?: string | null;
    reply_to_id?: string | null;
  },
  State extends Row & { author?: Profile | null },
>(prev: State[], row: Row, author: Profile | null): State[] {
  if (prev.some((m) => m.id === row.id)) return prev;
  const withoutDupes = prev.filter(
    (m) => !(m.id.startsWith("opt-") && matchesOptimisticRow(m, row)),
  );
  const next = { ...row, author: author ?? fallbackAuthor(row.author_id) } as State;
  return [...withoutDupes, next].sort(byTime);
}

/**
 * Placeholder author for a live message whose profile lookup failed.
 *
 * The alternative is dropping the message outright — which is what blanked
 * conversations until re-entry. This renders as "Unknown" with no avatar
 * and heals itself on the next reload (the fetched row wins the merge).
 */
export function fallbackAuthor(authorId: string | null): Profile {
  const now = new Date().toISOString();
  return {
    id: authorId ?? "unknown",
    username: null,
    display_name: null,
    avatar_url: null,
    bio: null,
    status: "offline",
    preferred_status: null,
    banner_url: null,
    accent_color: null,
    accent_color_2: null,
    theme: "dark",
    avatar_crop: null,
    show_owner_badge: false,
    show_staff_badge: false,
    show_og_badge: false,
    show_bounty_badge: false,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Merge a freshly fetched page into the rows already on screen instead of
 * replacing them.
 *
 * A fetch snapshot is taken earlier than it lands: any message that arrived
 * over realtime while it was in flight was already consumed as an event,
 * so a blind replace wipes it and it never comes back until you leave and
 * re-enter the conversation. The same replace also discarded optimistic
 * (unsent) rows and previously paged-in history on every background
 * refresh.
 *
 * Kept from the previous list: rows missing from the fetch that are newer
 * than the snapshot (realtime arrivals), older than the page (scrolled
 * history), or still unsent (`opt-` ids). Rows inside the fetched window
 * but absent from it are treated as deleted and dropped. Conflicts resolve
 * in favour of the fetched row (fresher author data).
 */
export function mergeFetchedRows<T extends MergeableMessageRow>(prev: T[], fetched: T[]): T[] {
  if (prev.length === 0) return fetched;
  if (fetched.length === 0) return prev;
  const seen = new Set(fetched.map((m) => m.id));
  let min = fetched[0].created_at;
  let max = fetched[0].created_at;
  for (const m of fetched) {
    if (m.created_at < min) min = m.created_at;
    if (m.created_at > max) max = m.created_at;
  }
  const older: T[] = [];
  const newer: T[] = [];
  for (const m of prev) {
    if (seen.has(m.id)) continue;
    if (m.id.startsWith("opt-") || m.created_at > max) newer.push(m);
    else if (m.created_at < min) older.push(m);
    // Inside the window but missing from the fetch: deleted. Drop it.
  }
  if (older.length === 0 && newer.length === 0) return fetched;
  older.sort(byTime);
  newer.sort(byTime);
  return [...older, ...fetched, ...newer];
}

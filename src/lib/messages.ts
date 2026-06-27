import type { Profile } from "@/lib/supabase/types";

export type AttachmentType = "image" | "video" | "gif" | "file";
export type MessageContext = "channel" | "dm" | "group";

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

export interface ReplyPreview {
  id: string;
  author_id: string;
  content: string;
  attachment_type?: AttachmentType | null;
  author?: Pick<Profile, "id" | "username" | "display_name">;
}

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "👀"] as const;

export function reactionKey(context: MessageContext, messageId: string): string {
  return `${context}:${messageId}`;
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

/** Match optimistic rows to realtime inserts (content + attachment aware). */
export function matchesOptimisticRow(
  opt: {
    author_id: string;
    content: string;
    attachment_url?: string | null;
    reply_to_id?: string | null;
  },
  real: {
    author_id: string;
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

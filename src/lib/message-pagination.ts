import type { SupabaseClient } from "@supabase/supabase-js";
import type { MessageContext, MessageReaction } from "@/lib/messages";

export const MESSAGE_PAGE_SIZE = 25;

export function trimToLatestWindow<T>(messages: T[]): { messages: T[]; trimmed: boolean } {
  if (messages.length <= MESSAGE_PAGE_SIZE) {
    return { messages, trimmed: false };
  }
  return { messages: messages.slice(-MESSAGE_PAGE_SIZE), trimmed: true };
}

export async function loadReactionsForMessages(
  supabase: SupabaseClient,
  context: MessageContext,
  messageIds: string[],
): Promise<MessageReaction[]> {
  if (!messageIds.length) return [];
  const { data } = await supabase
    .from("message_reactions")
    .select("*")
    .eq("context_type", context)
    .in("message_id", messageIds);
  return (data ?? []) as MessageReaction[];
}

export function mergeReactions(
  prev: MessageReaction[],
  context: MessageContext,
  incoming: MessageReaction[],
  messageIds: string[],
): MessageReaction[] {
  const idSet = new Set(messageIds);
  return [...prev.filter((r) => r.context_type !== context || !idSet.has(r.message_id)), ...incoming];
}

export function replaceReactionsForContext(
  prev: MessageReaction[],
  context: MessageContext,
  incoming: MessageReaction[],
): MessageReaction[] {
  return [...prev.filter((r) => r.context_type !== context), ...incoming];
}

export function paginateDescendingRows<T>(rows: T[] | null): { rows: T[]; hasMore: boolean } {
  const list = rows ?? [];
  const hasMore = list.length > MESSAGE_PAGE_SIZE;
  const page = hasMore ? list.slice(0, MESSAGE_PAGE_SIZE) : list;
  return { rows: [...page].reverse(), hasMore };
}

"use client";

/**
 * Saved messages and reminders (migration 0238). Anyone can save a message;
 * Disband Lite and Aero members can also have it brought back to them later,
 * which the database delivers as an inbox notification.
 *
 * Only references are stored. `resolveSavedMessages` reads each live message
 * through its own table's row-level security, so a deleted message, or one
 * in a conversation someone has left, shows as unavailable.
 */

import { useEffect } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { createStore, friendlyError, isMissingFeatureError, useStore } from "@/lib/feature-store";
import type { Profile } from "@/lib/supabase/types";

export type SavedContext = "channel" | "dm" | "group";

export interface SavedMessage {
  id: string;
  context: SavedContext;
  message_id: string;
  container_id: string;
  note: string | null;
  remind_at: string | null;
  reminded_at: string | null;
  created_at: string;
}

interface SavedState {
  userId: string | null;
  items: SavedMessage[];
  loaded: boolean;
  unavailable: boolean;
}

const EMPTY: SavedState = { userId: null, items: [], loaded: false, unavailable: false };
const store = createStore<SavedState>(EMPTY);
let loading: Promise<void> | null = null;

const COLUMNS = "id, context, message_id, container_id, note, remind_at, reminded_at, created_at";

export async function loadSavedMessages(userId: string): Promise<void> {
  if (loading && store.get().userId === userId) return loading;
  if (store.get().userId !== userId) store.set({ ...EMPTY, userId });
  const run = (async () => {
    try {
      const { data, error } = await getSupabaseClient()
        .from("saved_messages")
        .select(COLUMNS)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (store.get().userId !== userId) return;
      if (error) {
        store.set((s) => ({ ...s, loaded: true, unavailable: isMissingFeatureError(error) }));
        return;
      }
      store.set({ userId, items: (data as SavedMessage[] | null) ?? [], loaded: true, unavailable: false });
    } catch {
      if (store.get().userId === userId) store.set((s) => ({ ...s, loaded: true }));
    }
  })();
  loading = run;
  try {
    await run;
  } finally {
    if (loading === run) loading = null;
  }
}

export function findSaved(context: SavedContext, messageId: string): SavedMessage | undefined {
  return store.get().items.find((s) => s.context === context && s.message_id === messageId);
}

export async function saveMessage(
  userId: string,
  input: { context: SavedContext; messageId: string; containerId: string; remindAt?: string | null },
): Promise<string | null> {
  const state = store.get();
  if (state.userId !== userId || state.unavailable) return "Saved messages aren't available right now.";
  const existing = findSaved(input.context, input.messageId);
  if (existing) {
    return input.remindAt !== undefined ? setReminder(userId, existing.id, input.remindAt) : null;
  }
  const { data, error } = await getSupabaseClient()
    .from("saved_messages")
    .insert({
      user_id: userId,
      context: input.context,
      message_id: input.messageId,
      container_id: input.containerId,
      remind_at: input.remindAt ?? null,
    })
    .select(COLUMNS)
    .single();
  if (error || !data) {
    if (error?.code === "23505") {
      await loadSavedMessages(userId);
      return null;
    }
    return friendlyError(error, "Couldn't save that message. Try again.");
  }
  if (store.get().userId === userId) {
    store.set((s) => ({ ...s, items: [data as SavedMessage, ...s.items.filter((x) => x.id !== (data as SavedMessage).id)] }));
  }
  return null;
}

export async function unsaveMessage(userId: string, savedId: string): Promise<string | null> {
  const before = store.get().items;
  store.set((s) => ({ ...s, items: s.items.filter((x) => x.id !== savedId) }));
  const { error } = await getSupabaseClient().from("saved_messages").delete().eq("id", savedId).eq("user_id", userId);
  if (error) {
    if (store.get().userId === userId) store.set((s) => ({ ...s, items: before }));
    return friendlyError(error, "Couldn't remove it. Try again.");
  }
  return null;
}

/** Set, move or clear (null) the reminder on a saved message. */
export async function setReminder(userId: string, savedId: string, remindAt: string | null): Promise<string | null> {
  const { data, error } = await getSupabaseClient()
    .from("saved_messages")
    .update({ remind_at: remindAt })
    .eq("id", savedId)
    .eq("user_id", userId)
    .select(COLUMNS)
    .single();
  if (error || !data) return friendlyError(error, "Couldn't set that reminder. Try again.");
  if (store.get().userId === userId) {
    store.set((s) => ({ ...s, items: s.items.map((x) => (x.id === savedId ? (data as SavedMessage) : x)) }));
  }
  return null;
}

/** Loaded, and the backend has the table. */
export function savedAvailable(): boolean {
  const state = store.get();
  return state.loaded && !state.unavailable;
}

export function resetSavedMessages() {
  store.set(EMPTY);
}

export function useSavedMessages(userId: string | null | undefined): SavedState {
  const state = useStore(store);
  useEffect(() => {
    if (!userId) return;
    if (store.get().userId !== userId || (!store.get().loaded && !loading)) void loadSavedMessages(userId);
  }, [userId]);
  return userId && state.userId === userId ? state : EMPTY;
}

/** Quick reminder times offered in menus, from a given moment. */
export function reminderPresets(now: Date = new Date()): { id: string; label: string; at: Date }[] {
  const inMinutes = (m: number) => new Date(now.getTime() + m * 60_000);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + ((8 - nextWeek.getDay()) % 7 || 7));
  nextWeek.setHours(9, 0, 0, 0);
  return [
    { id: "20m", label: "In 20 minutes", at: inMinutes(20) },
    { id: "1h", label: "In 1 hour", at: inMinutes(60) },
    { id: "3h", label: "In 3 hours", at: inMinutes(180) },
    { id: "tomorrow", label: "Tomorrow at 9:00", at: tomorrow },
    { id: "week", label: "Next Monday at 9:00", at: nextWeek },
  ];
}

export type SavedAuthor = Pick<Profile, "id" | "username" | "display_name" | "avatar_url" | "accent_color" | "accent_color_2" | "avatar_crop">;

export interface ResolvedSaved {
  saved: SavedMessage;
  /** Null when the message is gone or no longer readable. */
  message: {
    content: string;
    created_at: string;
    author: SavedAuthor | null;
    hasAttachment: boolean;
  } | null;
  /** "#general", the group's name, or "Direct message". */
  where: string;
  /** For channels: the space id, so the list can name it. */
  serverId: string | null;
  /** routeToNotification link. */
  link: string;
}

const AUTHOR = "id, username, display_name, avatar_url, accent_color, accent_color_2, avatar_crop";

type Row = {
  id: string;
  content: string;
  created_at: string;
  attachment_url: string | null;
  // PostgREST returns an embedded to-one relation as an object; older
  // clients typed it as an array, so accept both.
  author: SavedAuthor | SavedAuthor[] | null;
};

/** Reads the live messages behind a list of saved ones, in three queries at most. */
export async function resolveSavedMessages(items: SavedMessage[]): Promise<ResolvedSaved[]> {
  const supabase = getSupabaseClient();
  const ids = (ctx: SavedContext) => items.filter((s) => s.context === ctx).map((s) => s.message_id);
  const channelIds = [...new Set(items.filter((s) => s.context === "channel").map((s) => s.container_id))];
  const groupIds = [...new Set(items.filter((s) => s.context === "group").map((s) => s.container_id))];

  const [channelMsgs, dmMsgs, groupMsgs, channels, groups] = await Promise.all([
    ids("channel").length
      ? supabase.from("messages").select(`id, content, created_at, attachment_url, author:profiles(${AUTHOR})`).in("id", ids("channel"))
      : Promise.resolve({ data: [] }),
    ids("dm").length
      ? supabase.from("dm_messages").select(`id, content, created_at, attachment_url, author:profiles(${AUTHOR})`).in("id", ids("dm"))
      : Promise.resolve({ data: [] }),
    ids("group").length
      ? supabase.from("group_messages").select(`id, content, created_at, attachment_url, author:profiles(${AUTHOR})`).in("id", ids("group"))
      : Promise.resolve({ data: [] }),
    channelIds.length
      ? supabase.from("channels").select("id, name, server_id").in("id", channelIds)
      : Promise.resolve({ data: [] }),
    groupIds.length
      ? supabase.from("group_chats").select("id, name").in("id", groupIds)
      : Promise.resolve({ data: [] }),
  ]);

  const byId = new Map<string, Row>();
  for (const result of [channelMsgs, dmMsgs, groupMsgs]) {
    for (const row of ((result as { data: unknown }).data as Row[] | null) ?? []) byId.set(row.id, row);
  }
  const channelInfo = new Map(
    (((channels as { data: unknown }).data as { id: string; name: string; server_id: string }[] | null) ?? []).map((c) => [c.id, c]),
  );
  const groupInfo = new Map(
    (((groups as { data: unknown }).data as { id: string; name: string }[] | null) ?? []).map((g) => [g.id, g]),
  );

  return items.map((saved) => {
    const row = byId.get(saved.message_id) ?? null;
    const channel = saved.context === "channel" ? channelInfo.get(saved.container_id) : undefined;
    const group = saved.context === "group" ? groupInfo.get(saved.container_id) : undefined;
    return {
      saved,
      message: row
        ? {
            content: row.content ?? "",
            created_at: row.created_at,
            author: Array.isArray(row.author) ? row.author[0] ?? null : row.author ?? null,
            hasAttachment: !!row.attachment_url,
          }
        : null,
      where:
        saved.context === "channel"
          ? channel ? `#${channel.name}` : "A channel"
          : saved.context === "group"
            ? group?.name ?? "A group chat"
            : "Direct message",
      serverId: channel?.server_id ?? null,
      link: `${saved.context}:${saved.container_id}`,
    };
  });
}

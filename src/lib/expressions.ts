import { useEffect, useSyncExternalStore } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

/*
 Custom emoji and stickers from spaces, shared by the pickers, the composer's
 `:` menu and message rendering.

 Every space you're in is loaded once (both kinds), so its emoji and stickers
 can be used in any chat. A message carries a custom emoji as <:name:id> and
 a sticker by id, so anything you see from a space you're not in is looked up
 by id (migration 0283 lets anyone signed in read them).
*/

export interface SpaceEmoji {
  id: string;
  name: string;
  url: string;
  serverId: string;
  animated: boolean;
}

export interface SpaceSticker {
  id: string;
  serverId: string;
  name: string;
  tags: string[];
  url: string;
  format: string;
}

const emojiById = new Map<string, SpaceEmoji>();
const stickerById = new Map<string, SpaceSticker>();
const emojiBySpace = new Map<string, SpaceEmoji[]>();
const stickersBySpace = new Map<string, SpaceSticker[]>();
const loadedSpaces = new Set<string>();
const loadingSpaces = new Set<string>();
const missingEmoji = new Set<string>();
const missingStickers = new Set<string>();
const pendingEmoji = new Set<string>();
const pendingStickers = new Set<string>();

let version = 0;
const listeners = new Set<() => void>();
function emit() {
  version += 1;
  listeners.forEach((l) => l());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const isAnimated = (url: string) => /\.(gif|webp|apng)(\?|$)/i.test(url);

function addEmoji(row: { id: number | string; name: string; url: string; server_id: string }) {
  const emoji: SpaceEmoji = {
    id: String(row.id),
    name: row.name,
    url: row.url,
    serverId: row.server_id,
    animated: isAnimated(row.url),
  };
  emojiById.set(emoji.id, emoji);
  return emoji;
}

function addSticker(row: { id: string; server_id: string; name: string; tags: string | null; url: string; format: string }) {
  const sticker: SpaceSticker = {
    id: row.id,
    serverId: row.server_id,
    name: row.name,
    tags: (row.tags ?? "").split(/[\s,]+/).filter(Boolean),
    url: row.url,
    format: row.format,
  };
  stickerById.set(sticker.id, sticker);
  return sticker;
}

/** Load the emoji and stickers of these spaces (once each). */
export function ensureSpaces(serverIds: string[]) {
  const ids = serverIds.filter((id) => id && !loadedSpaces.has(id) && !loadingSpaces.has(id));
  if (ids.length === 0) return;
  ids.forEach((id) => loadingSpaces.add(id));
  const supabase = getSupabaseClient();
  void Promise.all([
    supabase.from("custom_emoji").select("id, name, url, server_id").in("server_id", ids).order("name"),
    // Missing until migration 0283 is applied: then there are just no stickers.
    supabase.from("server_stickers").select("id, server_id, name, tags, url, format").in("server_id", ids).order("created_at"),
  ])
    .then(([emoji, stickers]) => {
      for (const id of ids) {
        emojiBySpace.set(id, []);
        stickersBySpace.set(id, []);
      }
      for (const row of (emoji.data as { id: number; name: string; url: string; server_id: string }[] | null) ?? []) {
        emojiBySpace.get(row.server_id)?.push(addEmoji(row));
      }
      for (const row of (stickers.data as Parameters<typeof addSticker>[0][] | null) ?? []) {
        stickersBySpace.get(row.server_id)?.push(addSticker(row));
      }
      ids.forEach((id) => loadedSpaces.add(id));
    })
    .catch(() => undefined)
    .finally(() => {
      ids.forEach((id) => loadingSpaces.delete(id));
      emit();
    });
}

/** Forget a space's emoji and stickers so the next use reloads them (after an upload, say). */
export function refreshSpace(serverId: string) {
  loadedSpaces.delete(serverId);
  ensureSpaces([serverId]);
}

let flushQueued = false;
function queueFlush() {
  if (flushQueued) return;
  flushQueued = true;
  queueMicrotask(() => {
    flushQueued = false;
    const emojiIds = [...pendingEmoji];
    const stickerIds = [...pendingStickers];
    pendingEmoji.clear();
    pendingStickers.clear();
    const supabase = getSupabaseClient();
    if (emojiIds.length) {
      const numeric = emojiIds.filter((id) => /^\d+$/.test(id));
      void supabase
        .from("custom_emoji")
        .select("id, name, url, server_id")
        .in("id", numeric)
        .then(({ data }) => {
          for (const row of (data as { id: number; name: string; url: string; server_id: string }[] | null) ?? []) addEmoji(row);
          emojiIds.forEach((id) => { if (!emojiById.has(id)) missingEmoji.add(id); });
          emit();
        });
    }
    if (stickerIds.length) {
      const uuids = stickerIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
      if (uuids.length === 0) {
        stickerIds.forEach((id) => missingStickers.add(id));
        emit();
        return;
      }
      void supabase
        .from("server_stickers")
        .select("id, server_id, name, tags, url, format")
        .in("id", uuids)
        .then(({ data }) => {
          for (const row of (data as Parameters<typeof addSticker>[0][] | null) ?? []) addSticker(row);
          stickerIds.forEach((id) => { if (!stickerById.has(id)) missingStickers.add(id); });
          emit();
        });
    }
  });
}

/** A custom emoji by id: known now, or null while it is looked up (or if it's gone). */
export function getEmoji(id: string): SpaceEmoji | null {
  const hit = emojiById.get(id);
  if (hit) return hit;
  if (!missingEmoji.has(id) && typeof window !== "undefined") {
    pendingEmoji.add(id);
    queueFlush();
  }
  return null;
}

export function isEmojiMissing(id: string) {
  return missingEmoji.has(id);
}

/** A space sticker by id, looked up the same way. `undefined` means "still asking". */
export function getSpaceSticker(id: string): SpaceSticker | null | undefined {
  const hit = stickerById.get(id);
  if (hit) return hit;
  if (missingStickers.has(id)) return null;
  if (typeof window !== "undefined") {
    pendingStickers.add(id);
    queueFlush();
  }
  return undefined;
}

export function spaceEmoji(serverId: string): SpaceEmoji[] {
  return emojiBySpace.get(serverId) ?? [];
}

export function spaceStickers(serverId: string): SpaceSticker[] {
  return stickersBySpace.get(serverId) ?? [];
}

/** Re-renders whenever anything new is loaded. Pass spaces to make sure they are. */
export function useExpressions(serverIds?: string[]): number {
  const v = useSyncExternalStore(subscribe, () => version, () => 0);
  const key = serverIds?.join(",") ?? "";
  useEffect(() => {
    if (key) ensureSpaces(key.split(","));
  }, [key]);
  return v;
}

/* ------------------------------------------------- composer names (:name:) */

export interface EmojiChoice {
  emoji: SpaceEmoji;
  /** What the composer shows: the name, with ~1, ~2… when another space already uses it. */
  label: string;
}

/**
 * Every custom emoji you can use, current space first, with names made
 * unique the way the composer shows them (`:wave:`, `:wave~1:`).
 */
export function emojiChoices(serverIds: string[], currentServerId?: string | null): EmojiChoice[] {
  const order = currentServerId ? [currentServerId, ...serverIds.filter((id) => id !== currentServerId)] : serverIds;
  const seen = new Map<string, number>();
  const out: EmojiChoice[] = [];
  for (const sid of order) {
    for (const emoji of spaceEmoji(sid)) {
      const key = emoji.name.toLowerCase();
      const n = seen.get(key) ?? 0;
      seen.set(key, n + 1);
      out.push({ emoji, label: n === 0 ? emoji.name : `${emoji.name}~${n}` });
    }
  }
  return out;
}

export function searchEmojiChoices(choices: EmojiChoice[], query: string, limit = 8): EmojiChoice[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts = choices.filter((c) => c.label.toLowerCase().startsWith(q));
  const contains = choices.filter((c) => !c.label.toLowerCase().startsWith(q) && c.label.toLowerCase().includes(q));
  return [...starts, ...contains].slice(0, limit);
}

/** `:name:` and `:name~1:` in a message about to be sent become <:name:id> (code is left alone). */
export function encodeCustomEmoji(text: string, choices: EmojiChoice[]): string {
  if (!choices.length || !text.includes(":")) return text;
  const byLabel = new Map(choices.map((c) => [c.label.toLowerCase(), c.emoji]));
  return text
    .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(/(?<![<\w])(?<!<a):([a-zA-Z0-9_]{2,32}(?:~\d+)?):(?!\d)/g, (whole, label: string) => {
            const emoji = byLabel.get(label.toLowerCase());
            return emoji ? `<${emoji.animated ? "a" : ""}:${emoji.name}:${emoji.id}>` : whole;
          }),
    )
    .join("");
}

/** The other way, for editing a message: <:name:id> back to what the composer shows. */
export function decodeCustomEmoji(text: string, choices: EmojiChoice[]): string {
  const byId = new Map(choices.map((c) => [c.emoji.id, c.label]));
  return text.replace(/<a?:([a-zA-Z0-9_]{2,32}):(\d+)>/g, (_w, name: string, id: string) => `:${byId.get(id) ?? name}:`);
}

/** For one-line previews (replies, notifications): <:name:id> reads as :name:. */
export function plainCustomEmoji(text: string): string {
  return text.replace(/<a?:([a-zA-Z0-9_]{2,32}):\d+>/g, ":$1:");
}

"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { asGuildTag, type GuildTag } from "@/lib/guild-tags";

/*
 Guild tags are read by user id, independently of the profile cache. Names
 appear in chat, the member list, DMs and profile cards, and every one of those
 surfaces can ask for the same tag without adding a tag column to `profiles`
 or teaching each profile query about it.

 Requests are batched into one `IN (...)` read per frame-ish window, so a chat
 page or a roster scroll does not become one request per name.
*/

const CACHE = new Map<string, GuildTag | null>();
const LISTENERS = new Map<string, Set<() => void>>();
const QUEUE = new Set<string>();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHUNK = 100;

let flushTimer: ReturnType<typeof setTimeout> | null = null;

function notify(userId: string) {
  for (const listener of LISTENERS.get(userId) ?? []) listener();
}

function schedule(userId: string) {
  if (!UUID_RE.test(userId) || CACHE.has(userId)) return;
  QUEUE.add(userId);
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, 40);
}

async function flush() {
  const ids = [...QUEUE].slice(0, CHUNK);
  for (const id of ids) QUEUE.delete(id);
  if (ids.length === 0) return;

  const found = new Map<string, GuildTag>();

  try {
    const { data, error } = await getSupabaseClient()
      .from("profile_guild_tags")
      .select("user_id, server_id, tag, icon, color")
      .in("user_id", ids);

    if (!error) {
      for (const row of data ?? []) {
        const record = row as Record<string, unknown>;
        const userId = typeof record.user_id === "string" ? record.user_id : null;
        const tag = asGuildTag(record);
        if (userId && tag) found.set(userId, tag);
      }
    } else {
      console.error("guild tags: could not load tags", error.message);
    }
  } catch (error) {
    console.error("guild tags: could not load tags", error);
  }

  for (const id of ids) {
    CACHE.set(id, found.get(id) ?? null);
    notify(id);
  }

  if (QUEUE.size > 0) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flush();
    }, 0);
  }
}

/** Read a user's worn tag. Returns null while unknown and when none is worn. */
export function useGuildTag(userId?: string | null): GuildTag | null {
  const id = userId && UUID_RE.test(userId) ? userId : null;
  const [, forceRender] = useState(0);

  useEffect(() => {
    if (!id) return;
    const listener = () => {
      forceRender((version) => version + 1);
      // An invalidation removes the cache entry and notifies. Re-request it so
      // the next render can show the current tag instead of staying blank.
      if (!CACHE.has(id)) schedule(id);
    };
    let listeners = LISTENERS.get(id);
    if (!listeners) {
      listeners = new Set();
      LISTENERS.set(id, listeners);
    }
    listeners.add(listener);
    if (!CACHE.has(id)) schedule(id);
    return () => {
      listeners?.delete(listener);
      if (listeners?.size === 0) LISTENERS.delete(id);
    };
  }, [id]);

  return id ? CACHE.get(id) ?? null : null;
}

/** Set a known tag immediately, e.g. after equipping it in Profile settings. */
export function primeGuildTag(userId: string, tag: GuildTag | null) {
  if (!UUID_RE.test(userId)) return;
  CACHE.set(userId, tag);
  notify(userId);
}

/** Force one user's tag to be read again (equip/clear, or a space edit). */
export function invalidateGuildTag(userId: string) {
  if (!UUID_RE.test(userId)) return;
  CACHE.delete(userId);
  notify(userId);
}

/**
 * A space's tag changed or was removed. The database has already cleared the
 * worn snapshots; drop every cached copy and let visible names refresh.
 */
export function invalidateAllGuildTags() {
  CACHE.clear();
  for (const userId of LISTENERS.keys()) notify(userId);
}

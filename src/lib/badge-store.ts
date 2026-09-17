"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

export interface BadgeDef {
  key: string;
  name: string;
  description: string;
  category: string;
  accent: string;
  sort: number;
}

export interface AwardedBadge extends BadgeDef {
  awarded_at: string;
  metadata: Record<string, unknown>;
}

const cache = new Map<string, AwardedBadge[]>();

const listeners = new Map<string, Set<() => void>>();

function notify(userId: string) {
  const set = listeners.get(userId);
  if (set) for (const fn of set) fn();
}

let catalogue: Map<string, BadgeDef> | null = null;
let catalogueLoad: Promise<Map<string, BadgeDef>> | null = null;

let queue = new Set<string>();
let queueTimer: number | null = null;

const CHUNK = 150;

async function loadCatalogue(): Promise<Map<string, BadgeDef>> {
  if (catalogue) return catalogue;
  if (!catalogueLoad) {
    catalogueLoad = (async () => {
      const { data } = await getSupabaseClient().from("badges").select("*");
      const map = new Map<string, BadgeDef>();
      for (const row of (data ?? []) as BadgeDef[]) map.set(row.key, row);
      catalogue = map;
      return map;
    })();
  }
  return catalogueLoad;
}

async function flush() {
  const ids = [...queue];
  queue = new Set();
  queueTimer = null;
  try {
    const defs = await loadCatalogue();
    const supabase = getSupabaseClient();
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const { data, error } = await supabase
        .from("user_badges")
        .select("user_id, badge_key, awarded_at, metadata")
        .in("user_id", slice)
        .eq("visible", true);
      if (error) continue;

      const grouped = new Map<string, AwardedBadge[]>();
      for (const row of (data ?? []) as Array<{
        user_id: string; badge_key: string; awarded_at: string; metadata: Record<string, unknown>;
      }>) {
        const def = defs.get(row.badge_key);
        if (!def) continue;
        const list = grouped.get(row.user_id) ?? [];
        list.push({ ...def, awarded_at: row.awarded_at, metadata: row.metadata ?? {} });
        grouped.set(row.user_id, list);
      }

      for (const id of slice) {
        cache.set(id, (grouped.get(id) ?? []).sort((a, b) => a.sort - b.sort));
      }
    }
  } finally {
    for (const id of ids) notify(id);
  }
}

function request(userId: string): void {
  queue.add(userId);
  if (queueTimer === null) queueTimer = window.setTimeout(() => void flush(), 16);
}

export function invalidateBadges(userId: string) {
  cache.delete(userId);
  request(userId);
}

const NONE: AwardedBadge[] = [];

export function useBadges(
  userId: string | null | undefined,
  { fresh = false }: { fresh?: boolean } = {},
): AwardedBadge[] {
  const [badges, setBadges] = useState<AwardedBadge[]>(() =>
    (userId ? cache.get(userId) : undefined) ?? NONE);

  useEffect(() => {
    if (!userId) { setBadges(NONE); return; }

    const sync = () => setBadges(cache.get(userId) ?? NONE);

    let set = listeners.get(userId);
    if (!set) { set = new Set(); listeners.set(userId, set); }
    set.add(sync);

    if (fresh) {

      sync();
      invalidateBadges(userId);
    } else if (cache.has(userId)) {
      sync();
    } else {
      request(userId);
    }

    return () => {
      set.delete(sync);
      if (set.size === 0) listeners.delete(userId);
    };
  }, [userId, fresh]);

  return badges;
}

export async function refreshOwnBadges(userId: string) {
  await getSupabaseClient().rpc("refresh_user_badges", { p_user: userId });
  invalidateBadges(userId);
}

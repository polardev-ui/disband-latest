"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * Badges, fetched once per person and shared across every place they appear.
 *
 * A profile's badges show up in the member list, on every message, and in the
 * profile card, so asking per component would mean one request per avatar on
 * screen. Requests for ids seen in the same tick are collected and sent as one
 * query, and answers are cached for the session.
 */

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
const inflight = new Map<string, Promise<AwardedBadge[]>>();
const listeners = new Set<() => void>();

let catalogue: Map<string, BadgeDef> | null = null;
let catalogueLoad: Promise<Map<string, BadgeDef>> | null = null;

let queue = new Set<string>();
let queueTimer: number | null = null;
let queueResolvers: Array<() => void> = [];

/** Same ceiling as profile loads: a long `in.(...)` filter is what broke them. */
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
  const resolvers = queueResolvers;
  queueResolvers = [];

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
      // Everyone asked for is cached, including those with none — otherwise
      // an empty answer is retried forever.
      for (const id of slice) {
        cache.set(id, (grouped.get(id) ?? []).sort((a, b) => a.sort - b.sort));
      }
    }
  } finally {
    resolvers.forEach((r) => r());
    listeners.forEach((l) => l());
  }
}

function request(userId: string): Promise<AwardedBadge[]> {
  const existing = inflight.get(userId);
  if (existing) return existing;

  const p = new Promise<void>((resolve) => {
    queue.add(userId);
    queueResolvers.push(resolve);
    if (queueTimer === null) queueTimer = window.setTimeout(flush, 16);
  }).then(() => cache.get(userId) ?? []);

  inflight.set(userId, p);
  void p.finally(() => inflight.delete(userId));
  return p;
}

/** Drop a cached answer so the next read refetches — used after an award. */
export function invalidateBadges(userId: string) {
  cache.delete(userId);
  listeners.forEach((l) => l());
}

export function useBadges(userId: string | null | undefined): AwardedBadge[] {
  const [badges, setBadges] = useState<AwardedBadge[]>(() =>
    userId ? cache.get(userId) ?? [] : []);

  useEffect(() => {
    if (!userId) { setBadges([]); return; }
    let alive = true;

    const sync = () => {
      const hit = cache.get(userId);
      if (hit && alive) setBadges(hit);
    };

    if (cache.has(userId)) sync();
    else void request(userId).then((b) => { if (alive) setBadges(b); });

    listeners.add(sync);
    return () => { alive = false; listeners.delete(sync); };
  }, [userId]);

  return badges;
}

/** Nudge the server to re-evaluate what the signed-in user has earned. */
export async function refreshOwnBadges(userId: string) {
  await getSupabaseClient().rpc("refresh_user_badges", { p_user: userId });
  invalidateBadges(userId);
}

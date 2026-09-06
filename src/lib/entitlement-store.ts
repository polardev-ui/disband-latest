"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { SubscriptionPlan } from "@/lib/subscription";

/**
 * Someone's effective plan and how long they have paid for it.
 *
 * A plan can come from a Stripe subscription or from claimed gift time, and
 * neither source alone is the answer — the server resolves both.
 *
 * Reads are batched and the answers are pushed only to the components that
 * asked for that person. The first version did neither: the member list
 * renders a badge per row, so a large server fired one request per member and
 * every answer re-rendered every other row. Several hundred members squared is
 * the frame drops and the flicker that came with them.
 */

export interface Entitlement {
  plan: SubscriptionPlan;
  /** Paid months so far, which chooses the badge tier. */
  months: number;
  since: string | null;
  giftUntil: string | null;
}

const EMPTY: Entitlement = { plan: "free", months: 0, since: null, giftUntil: null };

const cache = new Map<string, Entitlement>();

/** Listeners keyed by user, so one answer wakes only the rows showing them. */
const listeners = new Map<string, Set<() => void>>();

let queue = new Set<string>();
let timer: number | null = null;

/** Same ceiling the profile loads use; a longer array filter gets rejected. */
const CHUNK = 150;

function notify(userId: string) {
  const set = listeners.get(userId);
  if (set) for (const fn of set) fn();
}

async function flush() {
  const ids = [...queue];
  queue = new Set();
  timer = null;
  if (ids.length === 0) return;

  const supabase = getSupabaseClient();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase.rpc("get_entitlements", { p_users: slice });

    if (error) {
      // Cache the empty answer anyway: a failure that is retried on every
      // render is worse than a missing badge.
      for (const id of slice) if (!cache.has(id)) cache.set(id, EMPTY);
    } else {
      const rows = (data ?? []) as Array<{
        user_id: string; plan: string; months: number;
        since: string | null; gift_until: string | null;
      }>;
      const seen = new Set<string>();
      for (const row of rows) {
        seen.add(row.user_id);
        cache.set(row.user_id, {
          plan: (row.plan === "super" || row.plan === "basic" ? row.plan : "free") as SubscriptionPlan,
          months: typeof row.months === "number" ? row.months : 0,
          since: row.since,
          giftUntil: row.gift_until,
        });
      }
      for (const id of slice) if (!seen.has(id)) cache.set(id, EMPTY);
    }

    for (const id of slice) notify(id);
  }
}

function request(userId: string) {
  queue.add(userId);
  if (timer === null) timer = window.setTimeout(() => void flush(), 16);
}

export function invalidateEntitlement(userId: string) {
  cache.delete(userId);
  request(userId);
}

export function useEntitlement(userId: string | null | undefined): Entitlement {
  const [ent, setEnt] = useState<Entitlement>(() =>
    (userId ? cache.get(userId) : undefined) ?? EMPTY);

  useEffect(() => {
    if (!userId) { setEnt(EMPTY); return; }

    const sync = () => setEnt(cache.get(userId) ?? EMPTY);

    let set = listeners.get(userId);
    if (!set) { set = new Set(); listeners.set(userId, set); }
    set.add(sync);

    if (cache.has(userId)) sync();
    else request(userId);

    return () => {
      set.delete(sync);
      if (set.size === 0) listeners.delete(userId);
    };
  }, [userId]);

  return ent;
}

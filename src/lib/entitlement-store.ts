"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { SubscriptionPlan } from "@/lib/subscription";

/**
 * Someone's effective plan and how long they have paid for it.
 *
 * A plan can come from a Stripe subscription or from claimed gift time, and
 * neither source alone is the answer — get_entitlement resolves both server
 * side. Batched and cached the same way badges are, because this is read
 * beside every name on screen.
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
const inflight = new Map<string, Promise<Entitlement>>();
const listeners = new Set<() => void>();

async function load(userId: string): Promise<Entitlement> {
  const existing = inflight.get(userId);
  if (existing) return existing;

  const p = (async () => {
    const { data, error } = await getSupabaseClient().rpc("get_entitlement", { p_user: userId });
    const row = (data ?? {}) as {
      plan?: string; months?: number; since?: string | null; gift_until?: string | null;
    };
    const ent: Entitlement = error
      ? EMPTY
      : {
          plan: (row.plan === "super" || row.plan === "basic" ? row.plan : "free") as SubscriptionPlan,
          months: typeof row.months === "number" ? row.months : 0,
          since: row.since ?? null,
          giftUntil: row.gift_until ?? null,
        };
    cache.set(userId, ent);
    listeners.forEach((l) => l());
    return ent;
  })();

  inflight.set(userId, p);
  void p.finally(() => inflight.delete(userId));
  return p;
}

export function invalidateEntitlement(userId: string) {
  cache.delete(userId);
  listeners.forEach((l) => l());
}

export function useEntitlement(userId: string | null | undefined): Entitlement {
  const [ent, setEnt] = useState<Entitlement>(() =>
    userId ? cache.get(userId) ?? EMPTY : EMPTY);

  useEffect(() => {
    if (!userId) { setEnt(EMPTY); return; }
    let alive = true;

    const sync = () => {
      const hit = cache.get(userId);
      if (alive) setEnt(hit ?? EMPTY);
    };

    if (cache.has(userId)) sync();
    else void load(userId).then((e) => { if (alive) setEnt(e); });

    listeners.add(sync);
    return () => { alive = false; listeners.delete(sync); };
  }, [userId]);

  return ent;
}

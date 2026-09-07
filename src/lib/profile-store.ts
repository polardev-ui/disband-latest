"use client";

import { useEffect, useState } from "react";
import { fetchProfilesByIds } from "@/lib/fetch-profiles";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/supabase/types";

/**
 * Profiles by id, for places that hold ids but not people.
 *
 * A reaction row is a user id and an emoji; showing who reacted means turning
 * a handful of ids into names. Asking per id would fire a request for every
 * reactor on every message on screen, so requests are batched into one round
 * trip and answers are pushed only to the components that asked for that
 * person — the same shape the badge and entitlement loads use, and for the
 * same reason.
 */

const cache = new Map<string, Profile | null>();
const listeners = new Map<string, Set<() => void>>();

let queue = new Set<string>();
let timer: number | null = null;

function notify(id: string) {
  const set = listeners.get(id);
  if (set) for (const fn of set) fn();
}

async function flush() {
  const ids = [...queue];
  queue = new Set();
  timer = null;
  if (ids.length === 0) return;

  const found = await fetchProfilesByIds(getSupabaseClient(), ids);
  for (const id of ids) {
    // A miss is cached as null on purpose: a deleted account must not be
    // re-requested on every render.
    cache.set(id, found.get(id) ?? null);
    notify(id);
  }
}

function request(id: string) {
  queue.add(id);
  if (timer === null) timer = window.setTimeout(() => void flush(), 16);
}

/** Seed the cache from profiles the caller already has, e.g. a member list. */
export function primeProfiles(profiles: readonly (Profile | null | undefined)[]): void {
  for (const p of profiles) if (p?.id && !cache.has(p.id)) cache.set(p.id, p);
}

export function useProfiles(ids: readonly string[]): Map<string, Profile> {
  const key = ids.join(",");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (ids.length === 0) return;
    const sync = () => setVersion((v) => v + 1);
    const unsubscribes: (() => void)[] = [];

    for (const id of ids) {
      let set = listeners.get(id);
      if (!set) { set = new Set(); listeners.set(id, set); }
      set.add(sync);
      unsubscribes.push(() => {
        set.delete(sync);
        if (set.size === 0) listeners.delete(id);
      });
      if (!cache.has(id)) request(id);
    }

    return () => { for (const off of unsubscribes) off(); };
    // `key` stands in for the id list so a new array of the same ids is not a
    // resubscribe on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const out = new Map<string, Profile>();
  for (const id of ids) {
    const p = cache.get(id);
    if (p) out.set(id, p);
  }
  // `version` only exists to re-run this after an answer arrives.
  void version;
  return out;
}

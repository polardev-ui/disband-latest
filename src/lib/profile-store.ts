"use client";

import { useEffect, useState } from "react";
import { fetchProfilesByIds } from "@/lib/fetch-profiles";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/supabase/types";

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

    cache.set(id, found.get(id) ?? null);
    notify(id);
  }
}

function request(id: string) {
  queue.add(id);
  if (timer === null) timer = window.setTimeout(() => void flush(), 16);
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

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const out = new Map<string, Profile>();
  for (const id of ids) {
    const p = cache.get(id);
    if (p) out.set(id, p);
  }

  void version;
  return out;
}

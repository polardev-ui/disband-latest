"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { rankMembers } from "@/lib/slash-commands";
import type { Profile } from "@/lib/supabase/types";

/*
 Member lookup for the @ list and the /ban user picker.

 The composer only holds the members already loaded, which on a big space is
 a fraction of the roster. Local matches show at once; while a query is
 typed, the space's roster is also searched in the database (a member can
 read their own space's members), and the two are merged and re-ranked.
*/

const cache = new Map<string, Profile[]>();

export function useMemberSearch(
  serverId: string | null | undefined,
  query: string | null,
  local: Profile[],
  limit = 8,
): Profile[] {
  const q = (query ?? "").trim().replace(/^@/, "").toLowerCase();
  const key = serverId && q ? `${serverId}:${q}` : null;
  const [remote, setRemote] = useState<Profile[]>(() => (key ? cache.get(key) ?? [] : []));

  useEffect(() => {
    if (!key || !serverId) {
      setRemote([]);
      return;
    }
    const hit = cache.get(key);
    if (hit) {
      setRemote(hit);
      return;
    }
    let live = true;
    // Short debounce: one request per pause in typing, not per keystroke.
    const t = window.setTimeout(async () => {
      // PostgREST filter values: escape the pattern characters and commas.
      const safe = q.replace(/[%_\\,()]/g, (c) => `\\${c}`);
      const { data, error } = await getSupabaseClient()
        .from("server_members")
        .select("profile:profiles!server_members_user_id_fkey!inner(*)")
        .eq("server_id", serverId)
        .or(`username.ilike.${safe}%,display_name.ilike.%${safe}%`, { referencedTable: "profiles" })
        .limit(25);
      if (!live || error) return;
      const rows = ((data ?? []) as unknown as { profile: Profile | null }[])
        .map((r) => r.profile)
        .filter((p): p is Profile => !!p);
      cache.set(key, rows);
      if (cache.size > 200) cache.delete(cache.keys().next().value as string);
      setRemote(rows);
    }, 120);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [key, serverId, q]);

  return useMemo(() => {
    if (query === null) return [];
    const byId = new Map<string, Profile>();
    for (const p of local) byId.set(p.id, p);
    for (const p of remote) if (!byId.has(p.id)) byId.set(p.id, p);
    return rankMembers([...byId.values()], q, limit);
  }, [query, local, remote, q, limit]);
}

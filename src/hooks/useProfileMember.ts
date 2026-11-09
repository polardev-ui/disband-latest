"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

/*
 The membership row (roles, join date) for a profile opened inside a space.

 Big spaces only keep part of the roster in memory, so someone opened from
 the windowed member list is often missing from it. Treating "not loaded" as
 "not a member" hid the Roles section, which is why owners couldn't give
 people roles there. This fetches the row when it isn't loaded, and again
 whenever `refreshKey` changes (after a role edit).
*/

export interface ProfileMemberRow {
  server_id: string;
  user_id: string;
  role: string;
  joined_at: string;
  role_id: string | null;
  role_ids: string[];
}

// Rows already fetched, so reopening a profile shows its roles straight away.
const cache = new Map<string, ProfileMemberRow | null>();

/**
 * `pending` is true while the row is still on its way, so the card can hold
 * the Roles section's place instead of popping it in a second later.
 */
export function useProfileMember(
  serverId: string | null | undefined,
  userId: string | null | undefined,
  loaded: boolean,
  refreshKey: number,
): { row: ProfileMemberRow | null; pending: boolean } {
  const key = serverId && userId ? `${serverId}:${userId}` : null;
  const [state, setState] = useState<{ key: string | null; row: ProfileMemberRow | null; done: boolean }>({ key: null, row: null, done: false });

  useEffect(() => {
    if (!serverId || !userId || !key || (loaded && refreshKey === 0)) {
      setState({ key, row: null, done: true });
      return;
    }
    const hit = cache.get(key);
    setState({ key, row: hit ?? null, done: cache.has(key) });
    let live = true;
    void getSupabaseClient()
      .rpc("get_server_members_by_ids", { p_server_id: serverId, p_user_ids: [userId] })
      .then(({ data, error }) => {
        if (!live) return;
        const first = error ? hit ?? null : ((data ?? []) as ProfileMemberRow[])[0] ?? null;
        if (!error) cache.set(key, first);
        setState({ key, row: first, done: true });
      });
    return () => {
      live = false;
    };
  }, [serverId, userId, key, loaded, refreshKey]);

  const current = state.key === key;
  const row = current && state.row && state.row.user_id === userId && state.row.server_id === serverId ? state.row : null;
  const needsFetch = !!key && !(loaded && refreshKey === 0);
  return { row, pending: needsFetch && (!current || !state.done) };
}

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

export function useProfileMember(
  serverId: string | null | undefined,
  userId: string | null | undefined,
  loaded: boolean,
  refreshKey: number,
): ProfileMemberRow | null {
  const [row, setRow] = useState<ProfileMemberRow | null>(null);

  useEffect(() => {
    if (!serverId || !userId || (loaded && refreshKey === 0)) {
      setRow(null);
      return;
    }
    let live = true;
    void getSupabaseClient()
      .rpc("get_server_members_by_ids", { p_server_id: serverId, p_user_ids: [userId] })
      .then(({ data, error }) => {
        if (!live || error) return;
        const first = ((data ?? []) as ProfileMemberRow[])[0];
        setRow(first ?? null);
      });
    return () => {
      live = false;
    };
  }, [serverId, userId, loaded, refreshKey]);

  return row && row.user_id === userId && row.server_id === serverId ? row : null;
}

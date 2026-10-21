"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { getSupabaseClient } from "@/lib/supabase/client";

/*
 How many of a space's members are online right now.

 profiles.status can't answer that: a client that closes without saying
 goodbye stays "online" in the table, which is how a space showed thousands
 online with a handful present. Realtime presence is the truth (one global
 channel every signed-in client tracks into), so the count is: people in
 presence, not offline, who are members of this space.

 Membership of each present user is looked up once per space and cached for
 a while, so as people come and go the number updates from presence alone
 and only newcomers cost a lookup.
*/

const MEMBERSHIP_TTL_MS = 10 * 60_000;
const CHUNK = 1000; // get_server_members_by_ids caps a call at 1000 ids

const membership = new Map<string, { at: number; known: Map<string, boolean> }>();

function knownFor(serverId: string) {
  const entry = membership.get(serverId);
  if (entry && Date.now() - entry.at < MEMBERSHIP_TTL_MS) return entry.known;
  const fresh = { at: Date.now(), known: new Map<string, boolean>() };
  membership.set(serverId, fresh);
  return fresh.known;
}

/** Live online count for `serverId`; null until the first lookup lands. Only works while `active`. */
export function useLiveOnlineCount(serverId: string | null | undefined, active: boolean): number | null {
  const { presenceMap } = useApp();
  const [version, setVersion] = useState(0);

  const onlineIds = useMemo(
    () => [...presenceMap].filter(([, status]) => status !== "offline").map(([id]) => id),
    [presenceMap],
  );

  useEffect(() => {
    if (!active || !serverId) return;
    const known = knownFor(serverId);
    const unknown = onlineIds.filter((id) => !known.has(id));
    if (unknown.length === 0) return;
    let live = true;
    void (async () => {
      for (let i = 0; i < unknown.length; i += CHUNK) {
        const chunk = unknown.slice(i, i + CHUNK);
        const { data, error } = await getSupabaseClient().rpc("get_server_members_by_ids", {
          p_server_id: serverId,
          p_user_ids: chunk,
        });
        if (error) return;
        const members = new Set(((data ?? []) as { user_id: string }[]).map((r) => r.user_id));
        for (const id of chunk) known.set(id, members.has(id));
      }
      if (live) setVersion((v) => v + 1);
    })();
    return () => {
      live = false;
    };
  }, [serverId, active, onlineIds]);

  return useMemo(() => {
    if (!serverId) return null;
    const entry = membership.get(serverId);
    if (!entry || entry.known.size === 0) return null;
    return onlineIds.filter((id) => entry.known.get(id) === true).length;
    // `version` re-runs this when a lookup lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, onlineIds, version]);
}

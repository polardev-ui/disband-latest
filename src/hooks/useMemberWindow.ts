"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { PresenceMap } from "@/lib/presence";
import type { Profile, ServerMember } from "@/lib/supabase/types";

export type WindowMember = ServerMember & { profile: Profile };

/** Rows per offline page. A page is ~100 KB of profile JSON. */
export const MEMBER_WINDOW_PAGE = 100;
/** Pages kept either side of what's on screen; anything further is dropped. */
const KEEP_PAGES = 2;

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
let rpcOverride: Rpc | null = null;
/** Dev preview only: route the member-window RPCs somewhere else. */
export function setMemberWindowRpcForPreview(fn: Rpc | null) {
  rpcOverride = fn;
}
function rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> {
  if (rpcOverride) return rpcOverride(fn, args);
  return Promise.resolve(getSupabaseClient().rpc(fn, args)).then(({ data, error }) => ({ data, error }));
}

interface Row {
  server_id: string;
  user_id: string;
  role: ServerMember["role"];
  joined_at: string;
  role_id: string | null;
  role_ids: string[] | null;
  profile: Profile | null;
}

function toMember(r: Row): WindowMember | null {
  if (!r.profile) return null;
  return {
    server_id: r.server_id,
    user_id: r.user_id,
    role: r.role,
    joined_at: r.joined_at,
    role_id: r.role_id,
    role_ids: r.role_ids ?? [],
    profile: r.profile,
  };
}

/**
 * The member list's data, sized for spaces with thousands of members.
 *
 * - `total` is the exact member count from the server.
 * - `online` are the members live presence says are around (online, idle,
 *   do-not-disturb), fetched by id. Presence is the source of truth here:
 *   profiles.status goes stale whenever a tab closes without signing out.
 * - Offline members are everyone else, alphabetical, fetched a page at a time
 *   for whatever is on screen (`requestRange`) and dropped again once they're
 *   far off screen, so memory stays flat however far you scroll.
 *
 * `mode` is "local" when the windowed RPCs aren't available (an older
 * database, or a preview without a session); callers then fall back to the
 * members they already have.
 */
export function useMemberWindow(serverId: string | null, presence: PresenceMap) {
  const [total, setTotal] = useState<number | null>(null);
  const [mode, setMode] = useState<"window" | "local">("window");
  const [onlineById, setOnlineById] = useState<Map<string, WindowMember>>(new Map());
  const [pages, setPages] = useState<Map<number, WindowMember[]>>(new Map());
  const inflight = useRef<Set<number>>(new Set());
  // Bumped when the space changes: drops every in-flight response.
  const generation = useRef(0);
  // Bumped when the offline pages are invalidated (who's online changed).
  const pageGeneration = useRef(0);

  // Who presence says is around, as a stable sorted key.
  const onlineIds = useMemo(() => {
    const ids: string[] = [];
    presence.forEach((status, id) => {
      if (status && status !== "offline") ids.push(id);
    });
    return ids.sort();
  }, [presence]);
  const onlineKey = onlineIds.join(",");

  // Debounce the online set: presence churns, and every change re-keys the
  // offline pages (they exclude the online ids).
  const [settledOnline, setSettledOnline] = useState<string[]>(onlineIds);
  useEffect(() => {
    const t = window.setTimeout(() => setSettledOnline(onlineIds), 800);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlineKey]);

  // New space: start over.
  useEffect(() => {
    generation.current += 1;
    setTotal(null);
    setMode("window");
    setOnlineById(new Map());
    setPages(new Map());
    inflight.current.clear();
    if (!serverId) return;
    const gen = generation.current;
    void rpc("get_server_member_counts", { p_server_id: serverId })
      .then(({ data, error }) => {
        if (gen !== generation.current) return;
        const row = (Array.isArray(data) ? data[0] : data) as { total?: number | string } | null;
        if (error || !row || row.total == null) {
          setMode("local");
          return;
        }
        setTotal(Number(row.total));
      });
  }, [serverId]);

  // Resolve the online ids to members of this space.
  useEffect(() => {
    if (!serverId || mode !== "window") return;
    const gen = generation.current;
    const missing = settledOnline.filter((id) => !onlineById.has(id));
    if (missing.length === 0) return;
    void rpc("get_server_members_by_ids", { p_server_id: serverId, p_user_ids: missing.slice(0, 1000) })
      .then(({ data, error }) => {
        if (gen !== generation.current) return;
        if (error) {
          setMode("local");
          return;
        }
        setOnlineById((prev) => {
          const next = new Map(prev);
          for (const r of (data ?? []) as Row[]) {
            const m = toMember(r);
            if (m) next.set(m.user_id, m);
          }
          return next;
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, mode, settledOnline]);

  // Members of this space who are online right now (non-members drop out
  // because the RPC only returns people in the space).
  const online = useMemo(() => {
    const out: WindowMember[] = [];
    for (const id of settledOnline) {
      const m = onlineById.get(id);
      if (m) out.push(m);
    }
    return out;
  }, [settledOnline, onlineById]);

  // The offline pages exclude the online ids, so a change in who's online
  // shifts every offset: drop the cached pages and let the list ask again.
  const excludeKey = online.map((m) => m.user_id).join(",");
  useEffect(() => {
    pageGeneration.current += 1;
    setPages(new Map());
    inflight.current.clear();
  }, [excludeKey]);

  const offlineCount = total === null ? null : Math.max(0, total - online.length);

  /**
   * Ask for the offline rows [from, to) to be loaded; drop pages far away.
   * Called by the list on scroll with the indexes it's about to draw.
   */
  const requestRange = useCallback(
    (from: number, to: number) => {
      if (!serverId || mode !== "window" || offlineCount === null) return;
      const firstPage = Math.max(0, Math.floor(from / MEMBER_WINDOW_PAGE));
      const lastPage = Math.max(firstPage, Math.floor(Math.max(from, to - 1) / MEMBER_WINDOW_PAGE));
      const gen = generation.current;
      const pageGen = pageGeneration.current;
      const exclude = online.map((m) => m.user_id);

      // Release pages well outside the window.
      setPages((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const key of next.keys()) {
          if (key < firstPage - KEEP_PAGES || key > lastPage + KEEP_PAGES) {
            next.delete(key);
            changed = true;
          }
        }
        return changed ? next : prev;
      });

      for (let page = firstPage; page <= lastPage; page += 1) {
        if (page * MEMBER_WINDOW_PAGE >= offlineCount) break;
        if (inflight.current.has(page)) continue;
        inflight.current.add(page);
        void rpc("get_server_offline_members", {
            p_server_id: serverId,
            p_exclude: exclude,
            p_offset: page * MEMBER_WINDOW_PAGE,
            p_limit: MEMBER_WINDOW_PAGE,
          })
          .then(({ data, error }) => {
            if (gen !== generation.current || pageGen !== pageGeneration.current) return;
            if (error) {
              inflight.current.delete(page);
              return;
            }
            const rows = ((data ?? []) as Row[]).map(toMember).filter((m): m is WindowMember => !!m);
            setPages((prev) => {
              // Keep it only if it's still near the window; the reader may
              // have scrolled on while it was in flight.
              const next = new Map(prev);
              next.set(page, rows);
              return next;
            });
          });
      }
    },
    [serverId, mode, offlineCount, online],
  );

  const offlineAt = useCallback(
    (index: number): WindowMember | null => {
      const page = pages.get(Math.floor(index / MEMBER_WINDOW_PAGE));
      return page?.[index % MEMBER_WINDOW_PAGE] ?? null;
    },
    [pages],
  );

  // Pages that were evicted need to be fetchable again.
  const evictedRef = useRef<Map<number, WindowMember[]>>(pages);
  useEffect(() => {
    for (const key of evictedRef.current.keys()) {
      if (!pages.has(key)) inflight.current.delete(key);
    }
    evictedRef.current = pages;
  }, [pages]);

  return { mode, total, online, offlineCount, offlineAt, requestRange, loadedPages: pages.size };
}

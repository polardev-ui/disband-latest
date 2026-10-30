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

/**
 * Each space's count and resolved online members, kept for the session so a
 * revisit paints its list at once. Every revisit still re-reads them.
 */
const spaceCache = new Map<string, { total: number | null; onlineById: Map<string, WindowMember> }>();
const SPACE_CACHE_LIMIT = 12;

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
export function useMemberWindow(
  serverId: string | null,
  presence: PresenceMap,
  /** Scope the list to who can see this channel (a private channel lists fewer people). */
  channelId: string | null = null,
  /** Bumped when the roster changed (kick, join, role or channel permission change). */
  version = 0,
) {
  // One list per space+channel; the channel RPCs take the channel instead of the space.
  const listKey = serverId ? `${serverId}:${channelId ?? ""}` : null;
  const scope = channelId ? { p_channel_id: channelId } : { p_server_id: serverId };
  const fn = (name: "counts" | "ids" | "offline") => channelId
    ? { counts: "get_channel_member_counts", ids: "get_channel_members_by_ids", offline: "get_channel_offline_members" }[name]
    : { counts: "get_server_member_counts", ids: "get_server_members_by_ids", offline: "get_server_offline_members" }[name];
  const [total, setTotal] = useState<number | null>(null);
  const [mode, setMode] = useState<"window" | "local">("window");
  const [onlineById, setOnlineById] = useState<Map<string, WindowMember>>(new Map());
  const [resolvedOnlineIds, setResolvedOnlineIds] = useState<Set<string>>(new Set());
  const [onlineReady, setOnlineReady] = useState(false);
  // The space the state above belongs to. It trails `serverId` by a render
  // on a switch, and the cache must not file one space's members under another.
  const [stateServerId, setStateServerId] = useState<string | null>(null);
  const [onlineRetry, setOnlineRetry] = useState(0);
  const [pages, setPages] = useState<Map<number, WindowMember[]>>(new Map());
  const inflight = useRef<Set<number>>(new Set());
  const attemptedOnlineIds = useRef<Set<string>>(new Set());
  // Set when a space is restored from the cache: the next resolve pass
  // re-reads every online member, not only the ones it hasn't seen, so a
  // changed role, name or avatar doesn't stick around.
  const refreshCached = useRef(false);
  const onlineRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  useEffect(() => () => {
    if (onlineRetryTimer.current) clearTimeout(onlineRetryTimer.current);
  }, []);

  // New space: start over, from the cache when this space was seen before.
  useEffect(() => {
    generation.current += 1;
    const cached = listKey ? spaceCache.get(listKey) : undefined;
    setTotal(cached?.total ?? null);
    setMode("window");
    setOnlineById(cached ? new Map(cached.onlineById) : new Map());
    setResolvedOnlineIds(cached ? new Set(cached.onlineById.keys()) : new Set());
    setOnlineReady(!!cached);
    refreshCached.current = !!cached;
    setStateServerId(listKey);
    setPages(new Map());
    inflight.current.clear();
    attemptedOnlineIds.current.clear();
    if (onlineRetryTimer.current) {
      clearTimeout(onlineRetryTimer.current);
      onlineRetryTimer.current = null;
    }
    if (!serverId) return;
    const gen = generation.current;
    void rpc(fn("counts"), scope)
      .then(({ data, error }) => {
        if (gen !== generation.current) return;
        const row = (Array.isArray(data) ? data[0] : data) as { total?: number | string } | null;
        if (error || !row || row.total == null) {
          setMode("local");
          return;
        }
        setTotal(Number(row.total));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey, version]);

  // Resolve the online ids to members of this space. Chunked instead of
  // slicing at 1,000: the old cap silently dropped the rest of a busy roster
  // and those people fell through to the offline section.
  useEffect(() => {
    if (!serverId || mode !== "window") return;
    const gen = generation.current;
    const refreshAll = refreshCached.current;
    refreshCached.current = false;
    const missing = settledOnline.filter(
      (id) => (refreshAll || !onlineById.has(id)) && !attemptedOnlineIds.current.has(id),
    );
    if (missing.length === 0) {
      setOnlineReady(true);
      return;
    }
    for (const id of missing) attemptedOnlineIds.current.add(id);

    const chunks: string[][] = [];
    for (let i = 0; i < missing.length; i += 500) chunks.push(missing.slice(i, i + 500));

    void Promise.all(
      chunks.map(async (ids) => ({
        ids,
        result: await rpc(fn("ids"), { ...scope, p_user_ids: ids }),
      })),
    ).then((results) => {
      if (gen !== generation.current) return;
      const rows: Row[] = [];
      let failed = false;
      for (const { ids, result } of results) {
        if (result.error) {
          failed = true;
          for (const id of ids) attemptedOnlineIds.current.delete(id);
          continue;
        }
        rows.push(...((result.data ?? []) as Row[]));
      }

      if (rows.length > 0) {
        setOnlineById((prev) => {
          const next = new Map(prev);
          for (const r of rows) {
            const m = toMember(r);
            if (m) next.set(m.user_id, m);
          }
          return next;
        });
        setResolvedOnlineIds((prev) => {
          const next = new Set(prev);
          for (const r of rows) next.add(r.user_id);
          return next;
        });
      }
      setOnlineReady(true);

      // A transient failure must not downgrade a 5,000-person roster to the
      // first local page. Retry those ids shortly instead.
      if (failed && !onlineRetryTimer.current) {
        onlineRetryTimer.current = setTimeout(() => {
          onlineRetryTimer.current = null;
          setOnlineRetry((n) => n + 1);
        }, 2000);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey, version, mode, settledOnline, onlineById, onlineRetry]);

  // Keep the cache current for the next visit.
  useEffect(() => {
    if (!listKey || mode !== "window" || stateServerId !== listKey) return;
    spaceCache.delete(listKey);
    spaceCache.set(listKey, { total, onlineById });
    while (spaceCache.size > SPACE_CACHE_LIMIT) {
      const oldest = spaceCache.keys().next().value;
      if (oldest === undefined) break;
      spaceCache.delete(oldest);
    }
  }, [listKey, stateServerId, mode, total, onlineById]);

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

  // Members, not just renderable rows: a row with a missing profile still
  // occupies a member slot and must not be counted under Offline.
  const onlineMemberIds = useMemo(() => {
    const settled = new Set(settledOnline);
    return [...resolvedOnlineIds].filter((id) => settled.has(id)).sort();
  }, [resolvedOnlineIds, settledOnline]);

  // The offline pages exclude the online ids, so a change in who's online
  // shifts every offset: drop the cached pages and let the list ask again.
  const excludeKey = onlineMemberIds.join(",");
  useEffect(() => {
    pageGeneration.current += 1;
    setPages(new Map());
    inflight.current.clear();
  }, [excludeKey]);

  // Don't paint an Offline header until we know which presence ids are
  // actually members. Otherwise an online person can flash in Offline and
  // then jump into Online, which is what made the order look unstable.
  const offlineCount =
    total === null || !onlineReady ? null : Math.max(0, total - onlineMemberIds.length);

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
      const exclude = onlineMemberIds;

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
        void rpc(fn("offline"), {
            ...scope,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listKey, version, mode, offlineCount, onlineMemberIds],
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

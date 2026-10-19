"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { BotTag } from "@/components/ui/BotTag";
import { PlatformBadge } from "@/components/ui/PlatformBadge";
import { displayName } from "@/lib/utils";
import { roleGradientTextStyle, roleIsGradientAnimated } from "@/lib/profileColor";
import { memberIconRole } from "@/lib/role-icons";
import { listeningFor } from "@/lib/presence";
import type { Listening } from "@/lib/music-presence";
import { ListeningLine } from "@/components/ui/ListeningLine";
import { useMemberWindow } from "@/hooks/useMemberWindow";
import { RoleIcon } from "@/components/ui/RoleIcon";
import { StatusDot } from "@/components/ui/StatusDot";
import { useApp } from "@/contexts/AppContext";
import { IconShield } from "@/components/icons";
import { Tooltip } from "./Tooltip";
import type { Profile, ServerMember, ServerRole, UserStatus } from "@/lib/supabase/types";

interface MemberListProps {
  /** The space whose roster to window; when set, counts and pages come from the server. */
  serverId?: string | null;
  members: (ServerMember & { profile: Profile })[];
  roles: ServerRole[];
  loading?: boolean;
  /** Another page of members exists beyond what is loaded. */
  hasMore?: boolean;
  /** Ask for the next member page (called as the end of the list nears). */
  onLoadMore?: () => void;
  onMemberClick?: (member: ServerMember & { profile: Profile }) => void;
  onMemberContext?: (member: ServerMember & { profile: Profile }, x: number, y: number) => void;
}

type Member = ServerMember & { profile: Profile };

const STATUS_BG: Record<UserStatus, string> = {
  online: "bg-status-online",
  idle: "bg-status-idle",
  dnd: "bg-status-dnd",
  offline: "bg-status-offline",
};

const ROW_H = 44;
const HEADER_H = 36;

const OVERSCAN_PX = 600;

type Item =
  | { kind: "header"; key: string; label: string; count: number }
  | { kind: "member"; key: string; member: Member }
  /** An offline row by position; its member arrives with its page. */
  | { kind: "slot"; key: string; index: number };

function memberRoleIds(member: ServerMember): string[] {
  if (member.role_ids && member.role_ids.length > 0) return member.role_ids;
  return member.role_id ? [member.role_id] : [];
}

function topRole(member: ServerMember, roles: ServerRole[]): ServerRole | null {
  let best: ServerRole | null = null;
  for (const id of memberRoleIds(member)) {
    const r = roles.find((x) => x.id === id);
    if (r && (!best || r.position > best.position)) best = r;
  }
  return best;
}

function roleLabel(member: ServerMember, roles: ServerRole[]): string {
  if (member.role === "owner") return "Owner";
  return topRole(member, roles)?.name ?? (member.role === "admin" ? "Admin" : "Online");
}

function roleColor(member: ServerMember, roles: ServerRole[]): string | null {
  return topRole(member, roles)?.color ?? null;
}

export function MemberList({ serverId = null, members, roles, loading, hasMore, onLoadMore, onMemberClick, onMemberContext }: MemberListProps) {
  const { presenceMap, listeningMap, serverTimeouts } = useApp();
  const windowed = useMemberWindow(serverId, presenceMap);
  const useWindow = !!serverId && windowed.mode === "window" && windowed.total !== null;

  const timedOutIds = useMemo(() => {
    const now = Date.now();
    return new Set(
      serverTimeouts.filter((t) => Date.parse(t.expires_at) > now).map((t) => t.user_id),
    );
  }, [serverTimeouts]);

  const liveStatus = useCallback(
    (p: Profile): UserStatus => presenceMap.get(p.id) ?? "offline",
    [presenceMap],
  );

  const items = useMemo<Item[]>(() => {
    const online: Member[] = [];
    const offline: Member[] = [];
    if (useWindow) {
      online.push(...windowed.online);
    } else {
      for (const m of members) {
        (liveStatus(m.profile) === "offline" ? offline : online).push(m);
      }
    }

    const grouped = new Map<string, Member[]>();
    for (const m of online) {
      const key = roleLabel(m, roles);
      const list = grouped.get(key);
      if (list) list.push(m);
      else grouped.set(key, [m]);
    }

    const groupPriority = (label: string): number => {
      if (label === "Owner") return Number.MAX_SAFE_INTEGER;
      if (label === "Admin") return Number.MAX_SAFE_INTEGER - 1;
      const best = grouped
        .get(label)
        ?.reduce((max: number, m) => Math.max(max, topRole(m, roles)?.position ?? -1), -1);
      return best ?? -1;
    };
    const byName = (a: Member, b: Member) => displayName(a.profile).localeCompare(displayName(b.profile));

    const out: Item[] = [];
    for (const label of [...grouped.keys()].sort((a, b) => groupPriority(b) - groupPriority(a))) {
      const list = grouped.get(label)!.sort(byName);
      out.push({ kind: "header", key: `h:${label}`, label, count: list.length });
      for (const m of list) out.push({ kind: "member", key: m.user_id, member: m });
    }
    if (useWindow) {
      // The exact offline count, as positions; rows fill in page by page.
      const n = windowed.offlineCount ?? 0;
      if (n > 0) {
        out.push({ kind: "header", key: "h:offline", label: "Offline", count: n });
        for (let i = 0; i < n; i++) out.push({ kind: "slot", key: `o:${i}`, index: i });
      }
    } else if (offline.length > 0) {
      out.push({ kind: "header", key: "h:offline", label: "Offline", count: offline.length });
      for (const m of offline.sort(byName)) out.push({ kind: "member", key: m.user_id, member: m });
    }
    return out;
  }, [members, roles, liveStatus, useWindow, windowed.online, windowed.offlineCount]);

  const scrollerRef = useRef<HTMLElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(700);
  const [rowH, setRowH] = useState(ROW_H);
  const [headerH, setHeaderH] = useState(HEADER_H);

  const { offsets, total } = useMemo(() => {
    const offs = new Array<number>(items.length + 1);
    let y = 0;
    for (let i = 0; i < items.length; i++) {
      offs[i] = y;
      y += items[i].kind === "header" ? headerH : rowH;
    }
    offs[items.length] = y;
    return { offsets: offs, total: y };
  }, [items, rowH, headerH]);

  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
    // Only the first member page arrives with the space; the rest stream in
    // as the list is scrolled. Ask for the next page once its end comes into
    // view — extra calls while one is in flight are ignored upstream.
    if (!useWindow && hasMore && onLoadMore && el.scrollHeight - el.scrollTop - el.clientHeight < 1200) {
      onLoadMore();
    }
  }, [hasMore, onLoadMore, useWindow]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const measure = () => setViewport(el.clientHeight || window.innerHeight || 700);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const row = el.querySelector<HTMLElement>("[data-member-row]");
    const head = el.querySelector<HTMLElement>("[data-member-header]");
    if (row) {
      const h = row.getBoundingClientRect().height;
      if (h > 0 && Math.abs(h - rowH) > 0.5) setRowH(h);
    }
    if (head) {
      const h = head.getBoundingClientRect().height;
      if (h > 0 && Math.abs(h - headerH) > 0.5) setHeaderH(h);
    }
  }, [items.length, rowH, headerH]);

  const top = Math.max(0, scrollTop - OVERSCAN_PX);
  const bottom = scrollTop + viewport + OVERSCAN_PX;

  let first = binarySearch(offsets, top, items.length);
  let last = binarySearch(offsets, bottom, items.length);
  first = Math.max(0, first);
  last = Math.min(items.length, last + 1);

  const visible = items.slice(first, last);

  // Load the offline pages for the slots about to be drawn; the hook drops
  // pages that have scrolled far away.
  const slotFrom = visible.find((it) => it.kind === "slot");
  const slotTo = [...visible].reverse().find((it) => it.kind === "slot");
  const rangeFrom = slotFrom && slotFrom.kind === "slot" ? slotFrom.index : -1;
  const rangeTo = slotTo && slotTo.kind === "slot" ? slotTo.index + 1 : -1;
  const { requestRange } = windowed;
  useEffect(() => {
    if (rangeFrom < 0) return;
    const t = window.setTimeout(() => requestRange(rangeFrom, rangeTo), 60);
    return () => window.clearTimeout(t);
  }, [rangeFrom, rangeTo, requestRange]);
  const padTop = offsets[first] ?? 0;
  const padBottom = Math.max(0, total - (offsets[last] ?? total));

  // While members load, show shimmering placeholder rows instead of "0"
  // members followed by a pop-in list.
  if (loading && !useWindow) {
    return (
      <aside className="flex w-60 shrink-0 flex-col bg-bg-secondary px-4 py-4" aria-label="Loading members">
        <h2 className="px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
          Members
        </h2>
        <div className="flex flex-col gap-1" aria-hidden>
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2.5 rounded-[4px] px-2 py-1.5">
              <span className="skeleton-glimmer h-8 w-8 shrink-0 rounded-full" />
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span
                  className="skeleton-glimmer h-3 rounded"
                  style={{ width: `${52 + ((i * 37) % 34)}%` }}
                />
              </span>
            </div>
          ))}
        </div>
      </aside>
    );
  }

  // An empty server (or one whose members failed to load) used to render a
  // blank rail with no explanation.
  if (!useWindow && members.length === 0) {
    return (
      <aside className="flex w-60 shrink-0 flex-col bg-bg-secondary px-4 py-4">
        <h2 className="px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
          Members
        </h2>
        <p className="px-2 py-2 text-sm text-text-muted">
          No members to show yet.
        </p>
      </aside>
    );
  }

  return (

    <aside
      ref={scrollerRef}
      onScroll={onScroll}
      className="member-scroll flex w-60 shrink-0 flex-col overflow-y-auto bg-bg-secondary"
    >
      <div className="pb-5 pl-2 pr-0">
        <div style={{ height: padTop }} aria-hidden />
        {visible.map((item) =>
          item.kind === "header" ? (
            <h2
              key={item.key}
              data-member-header
              className="flex h-10 items-end truncate pb-1 pl-2 pr-2 pt-6 text-[12px] font-semibold uppercase leading-4 tracking-[0.02em] text-channels-default"
            >
              {item.label} — {item.count}
            </h2>
          ) : item.kind === "slot" ? (
            (() => {
              const m = windowed.offlineAt(item.index);
              return m ? (
                <Row
                  key={item.key}
                  m={m}
                  roles={roles}
                  live={liveStatus(m.profile)}
                  listening={null}
                  timedOut={timedOutIds.has(m.user_id)}
                  onClick={onMemberClick}
                  onContext={onMemberContext}
                />
              ) : (
                <SkeletonRow key={item.key} seed={item.index} />
              );
            })()
          ) : (
            <Row
              key={item.key}
              m={item.member}
              roles={roles}
              live={liveStatus(item.member.profile)}
              listening={liveStatus(item.member.profile) === "offline" ? null : listeningFor(item.member.profile, listeningMap)}
              timedOut={timedOutIds.has(item.member.user_id)}
              onClick={onMemberClick}
              onContext={onMemberContext}
            />
          ),
        )}
        <div style={{ height: padBottom }} aria-hidden />
        {hasMore && (
          <div className="flex flex-col gap-1 pt-1" aria-hidden>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2.5 rounded-[4px] px-2 py-1.5">
                <span className="skeleton-glimmer h-8 w-8 shrink-0 rounded-full" />
                <span className="skeleton-glimmer h-3 rounded" style={{ width: `${58 + ((i * 23) % 30)}%` }} />
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

/** A placeholder the height of a member row, shown until its page lands. */
function SkeletonRow({ seed }: { seed: number }) {
  return (
    <div data-member-row aria-hidden className="my-px flex h-[42px] w-[224px] items-center gap-3 px-2 opacity-30">
      <span className="h-8 w-8 shrink-0 rounded-full bg-bg-tertiary" />
      <span className="h-3.5 rounded-full bg-bg-tertiary" style={{ width: `${45 + ((seed * 37) % 40)}%` }} />
    </div>
  );
}

function binarySearch(offsets: number[], y: number, count: number): number {
  let lo = 0;
  let hi = count - 1;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid] <= y) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

function Row({
  m, roles, live, listening, timedOut, onClick, onContext,
}: {
  m: Member;
  roles: ServerRole[];
  live: UserStatus;
  listening: Listening | null;
  timedOut: boolean;
  onClick?: (m: Member) => void;
  onContext?: (m: Member, x: number, y: number) => void;
}) {
  const p = m.profile;
  const color = roleColor(m, roles);
  const gradRole = topRole(m, roles);
  const gradStyle = roleGradientTextStyle(gradRole);
  const iconRole = memberIconRole(m, roles);
  return (
    <button
      type="button"
      data-member-row
      onClick={() => onClick?.(m)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContext?.(m, e.clientX, e.clientY);
      }}
      className={`group my-px flex h-[42px] w-[224px] items-center gap-3 rounded-[4px] px-2 transition-colors duration-75 hover:bg-interactive-hover ${
        live === "offline" ? "opacity-30 hover:opacity-100" : ""
      }`}
    >
      <div className="relative shrink-0">
        <Avatar profile={p} size="sm" />
        {live !== "offline" && <StatusDot status={live} ring="var(--bg-secondary)" className="absolute -bottom-[3px] -right-[3px] group-hover:![background:var(--interactive-hover)]" />}
      </div>
      <span className="flex min-w-0 flex-1 flex-col items-start">
      <span
        className={`flex w-full min-w-0 items-center gap-1 truncate text-[16px] font-medium leading-5 ${live === "offline" ? "text-channels-default" : "text-channels-default group-hover:text-interactive-active"}`}
        style={color ? { color } : undefined}
      >
        <span className={`truncate ${gradStyle && roleIsGradientAnimated(gradRole) ? "animate-role-gradient" : ""}`} style={gradStyle ?? undefined}>{displayName(p)}</span>
        {iconRole && <RoleIcon icon={iconRole.icon} name={iconRole.name} size={15} />}
        <BotTag profile={p} size="sm" />
        <PlatformBadge userId={p.id} />
        {m.role === "owner" && (
          <Tooltip label="Space Owner" side="top" as="span">
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden className="shrink-0 text-[#f0b232]">
              <path fill="currentColor" fillRule="evenodd" d="M13.656 4.938 11.5 7.094 8.438 3.25a.555.555 0 0 0-.876 0L4.5 7.094 2.344 4.938a.5.5 0 0 0-.844.437l1.375 6.25c.05.23.255.375.488.375h9.274a.5.5 0 0 0 .488-.375l1.375-6.25a.5.5 0 0 0-.844-.437ZM3 13.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5Z" />
            </svg>
          </Tooltip>
        )}
        {m.role === "admin" && (
          <Tooltip label="Admin" side="top" as="span">
            <IconShield size={14} className="shrink-0 text-interactive-normal" />
          </Tooltip>
        )}
        {timedOut && (
          <Tooltip label="Timed out" side="top" as="span">
            <span className="shrink-0 rounded bg-status-dnd/20 px-1 py-px text-[10px] font-bold uppercase text-status-dnd">
              Muted
            </span>
          </Tooltip>
        )}
      </span>
      {listening && <ListeningLine listening={listening} className="w-full !leading-[16px]" />}
      </span>
    </button>
  );
}

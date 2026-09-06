"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { BotTag } from "@/components/ui/BotTag";
import { PlatformBadge } from "@/components/ui/PlatformBadge";
import { displayName } from "@/lib/utils";
import { useApp } from "@/contexts/AppContext";
import { IconCrown, IconShield } from "@/components/icons";
import { Tooltip } from "./Tooltip";
import type { Profile, ServerMember, ServerRole, UserStatus } from "@/lib/supabase/types";

interface MemberListProps {
  members: (ServerMember & { profile: Profile })[];
  roles: ServerRole[];
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

/** Starting guesses, replaced by real measurements after the first paint. */
const ROW_H = 44;
const HEADER_H = 36;

/**
 * How much is kept mounted beyond what fits on screen.
 *
 * Big enough that a flick of the wheel lands on rows that already exist, so
 * scrolling never shows a blank band; small enough that a server with
 * hundreds of members is only ever a few dozen live components.
 */
const OVERSCAN_PX = 600;

type Item =
  | { kind: "header"; key: string; label: string; count: number }
  | { kind: "member"; key: string; member: Member };

function memberRoleIds(member: ServerMember): string[] {
  if (member.role_ids && member.role_ids.length > 0) return member.role_ids;
  return member.role_id ? [member.role_id] : [];
}

/** Like Discord, the highest-priority role wins for grouping and colouring. */
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
  return topRole(member, roles)?.name ?? member.role;
}

function roleColor(member: ServerMember, roles: ServerRole[]): string | null {
  return topRole(member, roles)?.color ?? null;
}

/**
 * The member sidebar, rendering only the rows near the viewport.
 *
 * Every row carries an avatar, presence and a badge lookup, so a server with
 * several hundred members was several hundred live components whether or not
 * any of them were on screen — which is what made scrolling this column
 * stutter. Rows outside the viewport are replaced by two spacers that hold
 * the scrollbar exactly where it would otherwise be, so the list scrolls,
 * measures and jumps identically to a fully rendered one.
 */
export function MemberList({ members, roles, onMemberClick, onMemberContext }: MemberListProps) {
  const { presenceMap } = useApp();

  const liveStatus = useCallback(
    (p: Profile): UserStatus => presenceMap.get(p.id) ?? "offline",
    [presenceMap],
  );

  // One flat list of headers and rows: a virtualised list needs a single
  // index space, and the grouping is only a matter of which items are headers.
  const items = useMemo<Item[]>(() => {
    const online: Member[] = [];
    const offline: Member[] = [];
    for (const m of members) {
      (liveStatus(m.profile) === "offline" ? offline : online).push(m);
    }

    const grouped = new Map<string, Member[]>();
    for (const m of online) {
      const key = roleLabel(m, roles);
      const list = grouped.get(key);
      if (list) list.push(m);
      else grouped.set(key, [m]);
    }

    const out: Item[] = [];
    for (const [label, list] of grouped) {
      out.push({ kind: "header", key: `h:${label}`, label, count: list.length });
      for (const m of list) out.push({ kind: "member", key: m.user_id, member: m });
    }
    if (offline.length > 0) {
      out.push({ kind: "header", key: "h:offline", label: "Offline", count: offline.length });
      for (const m of offline) out.push({ kind: "member", key: m.user_id, member: m });
    }
    return out;
  }, [members, roles, liveStatus]);

  const scrollerRef = useRef<HTMLElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(700);
  const [rowH, setRowH] = useState(ROW_H);
  const [headerH, setHeaderH] = useState(HEADER_H);

  // Where every item starts, and how tall the whole list is. Two heights are
  // in play, so this is a running total rather than index × height.
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
    if (el) setScrollTop(el.scrollTop);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    // A column that has not been given its height yet measures 0, and a
    // window of zero renders only the overscan — enough to scroll, but a
    // needlessly thin band. Fall back to the screen until it settles.
    const measure = () => setViewport(el.clientHeight || window.innerHeight || 700);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Real heights, taken from what the browser actually laid out. Guessing
  // wrong only shifts the window slightly, but it makes the scrollbar the
  // wrong length, which is visible.
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
  const padTop = offsets[first] ?? 0;
  const padBottom = Math.max(0, total - (offsets[last] ?? total));

  return (
    // No breakpoint of its own. DiscordApp already decides whether to mount
    // this, using `useIsMobile` at 768px — and a second, stricter CSS gate at
    // lg (1024px) meant that between 768 and 1024 the list was mounted and
    // then hidden by the stylesheet, so the column simply vanished on a
    // narrower desktop window.
    <aside
      ref={scrollerRef}
      onScroll={onScroll}
      className="flex w-60 shrink-0 flex-col overflow-y-auto bg-bg-secondary"
    >
      <div className="px-4 py-4">
        <div style={{ height: padTop }} aria-hidden />
        {visible.map((item) =>
          item.kind === "header" ? (
            <h2
              key={item.key}
              data-member-header
              className="flex items-end px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-text-muted"
            >
              {item.label} — {item.count}
            </h2>
          ) : (
            <Row
              key={item.key}
              m={item.member}
              roles={roles}
              live={liveStatus(item.member.profile)}
              onClick={onMemberClick}
              onContext={onMemberContext}
            />
          ),
        )}
        <div style={{ height: padBottom }} aria-hidden />
      </div>
    </aside>
  );
}

/** Index of the last item starting at or before `y`. */
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
  m, roles, live, onClick, onContext,
}: {
  m: Member;
  roles: ServerRole[];
  live: UserStatus;
  onClick?: (m: Member) => void;
  onContext?: (m: Member, x: number, y: number) => void;
}) {
  const p = m.profile;
  const color = roleColor(m, roles);
  return (
    <button
      type="button"
      data-member-row
      onClick={() => onClick?.(m)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContext?.(m, e.clientX, e.clientY);
      }}
      className="group flex w-full items-center gap-3 rounded px-2 py-1.5 transition-all duration-150 ease-in-out hover:bg-interactive-hover"
    >
      <div className="relative shrink-0">
        <Avatar profile={p} size="sm" />
        {live !== "offline" && (
          <span className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[3px] border-bg-secondary ${STATUS_BG[live]}`} />
        )}
      </div>
      <span
        className={`flex min-w-0 flex-1 items-center gap-1.5 truncate text-[15px] ${live === "offline" ? "text-text-muted" : "text-text-normal"}`}
        style={color ? { color } : undefined}
      >
        <span className="truncate">{displayName(p)}</span>
        <BotTag profile={p} size="sm" />
        <PlatformBadge userId={p.id} />
        {m.role === "owner" && (
          <Tooltip label="Owner" side="top" as="span">
            <IconShield size={14} className="shrink-0 text-status-online" />
          </Tooltip>
        )}
        {m.role === "admin" && (
          <Tooltip label="Admin" side="top" as="span">
            <IconCrown size={14} className="shrink-0 text-[#f0b232]" />
          </Tooltip>
        )}
      </span>
    </button>
  );
}

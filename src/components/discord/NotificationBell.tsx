"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ComponentType } from "react";
import { createPortal } from "react-dom";
import { useApp } from "@/contexts/AppContext";
import {
  IconAt,
  IconBell,
  IconCheckAll,
  IconInbox,
  IconMegaphone,
  IconMessage,
  IconReply,
  IconUserPlus,
} from "@/components/icons";
import type { IconProps } from "@/components/icons";
import { usePresence } from "@/hooks/usePresence";
import type { AppNotification } from "@/lib/supabase/types";

function timeAgo(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "now";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type Bucket = "Today" | "Yesterday" | "Earlier";
const BUCKET_ORDER: Bucket[] = ["Today", "Yesterday", "Earlier"];

function bucketOf(iso: string): Bucket {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "Earlier";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (then >= startOfToday) return "Today";
  if (then >= startOfToday - 86_400_000) return "Yesterday";
  return "Earlier";
}

/**
 * Pick a leading glyph and accent for a notification from its `type`. The
 * database writes the type (mention, dm, everyone, system, …); anything we do
 * not recognise falls back to the plain bell so it still reads.
 */
function visualFor(type: string): { Icon: ComponentType<IconProps>; accent: string } {
  const t = (type ?? "").toLowerCase();
  if (t.includes("mention")) return { Icon: IconAt, accent: "bg-brand/[0.14] text-brand" };
  if (t.includes("everyone")) return { Icon: IconMegaphone, accent: "bg-amber-400/[0.14] text-amber-300" };
  if (t.includes("reply")) return { Icon: IconReply, accent: "bg-sky-400/[0.14] text-sky-300" };
  if (t.includes("friend")) return { Icon: IconUserPlus, accent: "bg-emerald-400/[0.14] text-emerald-300" };
  if (t.includes("dm") || t.includes("direct") || t.includes("message")) {
    return { Icon: IconMessage, accent: "bg-emerald-400/[0.14] text-emerald-300" };
  }
  if (t.includes("system") || t.includes("broadcast") || t.includes("announce")) {
    return { Icon: IconMegaphone, accent: "bg-violet-400/[0.14] text-violet-300" };
  }
  return { Icon: IconBell, accent: "bg-interactive-hover text-text-muted" };
}

function NotificationRow({
  notification,
  onSelect,
}: {
  notification: AppNotification;
  onSelect: (n: AppNotification) => void;
}) {
  const { Icon, accent } = visualFor(notification.type);
  const unread = !notification.read;
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(notification)}
        className="mx-2 flex w-[calc(100%-16px)] items-start gap-3 rounded-[4px] px-2 py-2.5 text-left transition-colors hover:bg-interactive-hover"
      >
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${accent}`}>
          <Icon size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={`block break-words text-[16px] leading-5 ${
              unread ? "font-semibold text-header-primary" : "font-medium text-header-secondary"
            }`}
          >
            {notification.title}
          </span>
          {notification.body && (
            <span className="mt-0.5 line-clamp-2 block break-words text-[14px] leading-[18px] text-header-secondary">
              {notification.body}
            </span>
          )}
          <span className="mt-1 block text-[12px] text-text-muted">
            {timeAgo(notification.created_at)}
          </span>
        </span>
        {unread && <span aria-label="Unread" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-status-dnd" />}
      </button>
    </li>
  );
}

function FilterTab({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-7 items-center gap-1.5 rounded-[4px] px-2 text-[14px] font-medium transition-colors ${
        active
          ? "bg-interactive-selected text-interactive-active"
          : "text-interactive-normal hover:bg-interactive-hover hover:text-interactive-active"
      }`}
    >
      {children}
      {count > 0 && (
        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-status-dnd px-1 text-[12px] font-bold leading-none text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}

function EmptyState({ unreadOnly }: { unreadOnly: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-bg-tertiary text-interactive-normal">
        <IconInbox size={30} />
      </span>
      <p className="text-[16px] font-semibold text-header-primary">
        {unreadOnly ? "You’re all caught up" : "No notifications yet"}
      </p>
      <p className="mt-1 max-w-[17rem] text-[14px] leading-[18px] text-header-secondary">
        {unreadOnly
          ? "Nothing unread right now."
          : "Mentions, replies, and messages will show up here."}
      </p>
    </div>
  );
}

/**
 * The global notification entry point. Lives in the app title bar (desktop and
 * wide web) and in the mobile top bar, so it is reachable from anywhere in the
 * app rather than only the DM/server headers.
 */
export function NotificationBell({ compact = false }: { compact?: boolean }) {
  const {
    notifications,
    markNotificationsSeen,
    markNotificationRead,
    markNotificationsRead,
    routeToNotification,
  } = useApp();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [navError, setNavError] = useState<string | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0, maxHeight: 0 });

  // Keep the panel mounted through its exit animation (see usePresence).
  const { mounted, exiting } = usePresence(open, 180);

  const unseen = notifications.filter((n) => !n.seen_at).length;
  const unread = notifications.filter((n) => !n.read).length;
  const shown = filter === "unread" ? notifications.filter((n) => !n.read) : notifications;

  const groups = useMemo(() => {
    const map = new Map<Bucket, AppNotification[]>();
    for (const n of shown) {
      const bucket = bucketOf(n.created_at);
      const list = map.get(bucket);
      if (list) list.push(n);
      else map.set(bucket, [n]);
    }
    return BUCKET_ORDER.filter((b) => map.has(b)).map((b) => ({ label: b, items: map.get(b)! }));
  }, [shown]);

  const toggle = useCallback(() => {
    // Side effects live in the handler, not an updater: calling another
    // component's setState inside a setOpen updater runs during render and
    // throws ("Cannot update a component while rendering").
    if (!open) {
      setNavError(null);
      setFilter("all");
      void markNotificationsSeen();
    }
    setOpen((v) => !v);
  }, [markNotificationsSeen, open]);

  useLayoutEffect(() => {
    if (!mounted) return;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      const panel = panelRef.current;
      if (!r || !panel) return;
      const margin = 8;
      const width = panel.getBoundingClientRect().width;
      const right = Math.max(
        margin,
        Math.min(window.innerWidth - r.right, window.innerWidth - width - margin),
      );
      const top = Math.max(margin, Math.min(r.bottom + margin, window.innerHeight - margin));
      const maxHeight = Math.max(0, Math.min(window.innerHeight * 0.68, window.innerHeight - top - margin));
      setPos({ top, right, maxHeight });
    };
    place();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (!open) return;
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [mounted, open]);

  const handleItemClick = useCallback(
    async (n: AppNotification) => {
      setNavError(null);
      if (!n.read) void markNotificationRead(n.id);
      // Stay open with an explanation when the target is gone (deleted,
      // revoked, stale link) instead of dropping the user on a blank pane.
      const ok = await routeToNotification(n.link, n.created_at);
      if (!ok) {
        setNavError("Couldn’t open that conversation. It may have been deleted.");
        return;
      }
      setOpen(false);
    },
    [markNotificationRead, routeToNotification],
  );

  const badge = unseen > 9 ? "9+" : unseen;

  const panel =
    mounted && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Notifications"
            style={pos}
            className={`notif-pop${exiting ? " notif-pop-out" : ""} fixed z-[120] flex w-[480px] max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-lg bg-bg-secondary shadow-[var(--elevation-high)]`}
          >
            <header className="shrink-0 bg-bg-tertiary px-4 pb-3 pt-4">
              <div className="flex items-center gap-2">
                <IconInbox size={24} className="text-interactive-normal" />
                <h2 className="flex-1 text-[20px] font-bold leading-6 text-header-primary">Inbox</h2>
                <button
                  type="button"
                  onClick={() => void markNotificationsRead()}
                  disabled={unread === 0}
                  title="Mark all as read"
                  aria-label="Mark all as read"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-secondary text-interactive-normal transition-colors hover:text-interactive-active disabled:cursor-default disabled:opacity-40"
                >
                  <IconCheckAll size={18} />
                </button>
              </div>
              <div className="mt-3 flex gap-2">
                <FilterTab active={filter === "all"} count={0} onClick={() => setFilter("all")}>
                  All
                </FilterTab>
                <FilterTab active={filter === "unread"} count={unread} onClick={() => setFilter("unread")}>
                  Unreads
                </FilterTab>
              </div>
            </header>

            <div className="chat-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
              {navError && (
                <p role="alert" className="mx-4 mt-3 rounded-[4px] bg-status-dnd/10 px-3 py-2 text-[14px] text-status-dnd">
                  {navError}
                </p>
              )}
              {groups.length === 0 ? (
                <EmptyState unreadOnly={filter === "unread"} />
              ) : (
                groups.map((group) => (
                  <section key={group.label}>
                    <p className="sticky top-0 z-[1] bg-bg-secondary px-4 pb-1 pt-4 text-[12px] font-bold uppercase leading-4 tracking-[0.02em] text-header-secondary">
                      {group.label}
                    </p>
                    <ul>
                      {group.items.map((n) => (
                        <NotificationRow key={n.id} notification={n} onSelect={handleItemClick} />
                      ))}
                    </ul>
                  </section>
                ))
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        title="Notifications"
        aria-label={unseen > 0 ? `${unseen} unread notifications` : "Notifications"}
        aria-expanded={open}
        className={`relative flex shrink-0 items-center justify-center rounded-full transition-all hover:bg-interactive-hover ${
          compact ? "h-7 w-7" : "h-8 w-8"
        } ${open ? "text-text-normal" : "text-text-muted hover:text-text-normal"}`}
      >
        <IconBell size={compact ? 16 : 18} />
        {unseen > 0 && (
          <span
            className={`absolute -right-0.5 -top-0.5 flex items-center justify-center rounded-full bg-status-dnd px-1 font-bold leading-none text-white ${
              compact ? "h-3.5 min-w-3.5 text-[9px]" : "h-4 min-w-4 text-[10px]"
            }`}
          >
            {badge}
          </span>
        )}
      </button>
      {panel}
    </>
  );
}

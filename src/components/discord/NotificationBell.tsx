"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "@/contexts/AppContext";
import { IconBell } from "@/components/icons";
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

export function NotificationBell() {
  const {
    notifications,
    markNotificationsSeen,
    markNotificationRead,
    markNotificationsRead,
    routeToNotification,
  } = useApp();
  const [open, setOpen] = useState(false);
  const [navError, setNavError] = useState<string | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });

  const unseen = notifications.filter((n) => !n.seen_at).length;

  const toggle = useCallback(() => {
    // Side effect lives in the handler, not the updater: calling another
    // component's setState inside a setOpen updater runs during render and
    // throws ("Cannot update a component while rendering"). It would also
    // double-fire under StrictMode's double-invoked updaters.
    if (!open) {
      setNavError(null);
      void markNotificationsSeen();
    }
    setOpen(!open);
  }, [markNotificationsSeen, open]);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;

      const right = Math.max(8, window.innerWidth - r.right);
      setPos({ top: r.bottom + 8, right });
    };
    place();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
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
  }, [open ]);

  const handleItemClick = useCallback(async (n: AppNotification) => {
    setNavError(null);
    if (!n.read) void markNotificationRead(n.id);
    // Stay open with an explanation when the target is gone (deleted,
    // revoked, stale link) instead of dropping the user on a blank pane.
    // The notification timestamp goes along so the chat can land on the
    // ping itself rather than just the channel bottom.
    const ok = await routeToNotification(n.link, n.created_at);
    if (!ok) {
      setNavError("Couldn’t open that conversation. It may have been deleted.");
      return;
    }
    setOpen(false);
  }, [markNotificationRead, routeToNotification]);

  const drawer =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            className="fixed z-[120] max-h-[60vh] w-[min(20rem,calc(100vw-16px))] overflow-y-auto rounded-lg bg-bg-secondary shadow-xl ring-1 ring-divider"
            style={{ top: pos.top, right: pos.right }}
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-divider bg-bg-secondary px-3 py-2">
              <p className="text-sm font-bold text-text-normal">Notifications</p>
              {notifications.some((n) => !n.read) && (
                <button
                  type="button"
                  onClick={() => void markNotificationsRead()}
                  className="text-xs font-medium text-brand hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>
            {navError && (
              <p role="alert" className="border-b border-divider bg-status-dnd/10 px-3 py-2 text-xs text-status-dnd">
                {navError}
              </p>
            )}
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-[13px] text-text-muted">
                Nothing here yet — mentions and replies will land here.
              </p>
            ) : (
              <ul>
                {notifications.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => void handleItemClick(n)}
                      className={`flex w-full items-start gap-2.5 border-b border-divider/50 px-3 py-2.5 text-left transition-colors hover:bg-interactive-hover ${
                        n.read ? "opacity-70" : ""
                      }`}
                    >
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          n.read ? "bg-transparent" : "bg-brand"
                        }`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block line-clamp-2 text-[13px] font-semibold leading-snug text-text-normal">
                          {n.title}
                        </span>
                        {n.body && (
                          <span className="mt-0.5 block line-clamp-3 text-[13px] leading-snug text-text-muted">
                            {n.body}
                          </span>
                        )}
                        <span className="mt-0.5 block text-[11px] text-text-muted/70">
                          {timeAgo(n.created_at)}
                        </span>
                      </span>
                      {!n.seen_at && (
                        <span className="mt-1 shrink-0 rounded bg-status-dnd/15 px-1.5 py-0.5 text-[10px] font-bold text-status-dnd">
                          NEW
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
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
        className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all hover:bg-interactive-hover ${
          open ? "text-text-normal" : "text-text-muted hover:text-text-normal"
        }`}
      >
        <IconBell size={18} />
        {unseen > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-dnd px-1 text-[10px] font-bold leading-none text-white">
            {unseen > 9 ? "9+" : unseen}
          </span>
        )}
      </button>
      {drawer}
    </>
  );
}

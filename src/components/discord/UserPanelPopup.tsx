"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useApp } from "@/contexts/AppContext";
import { Avatar } from "@/components/ui/Avatar";
import { displayName } from "@/lib/utils";
import { statusLabel } from "@/lib/presence";
import type { UserStatus } from "@/lib/supabase/types";

const STATUS_DOT_BG: Record<UserStatus, string> = {
  online: "bg-status-online",
  idle: "bg-status-idle",
  dnd: "bg-status-dnd",
  offline: "bg-status-offline",
};

const STATUS_OPTIONS: { status: UserStatus; label: string }[] = [
  { status: "online", label: "Online" },
  { status: "idle", label: "Idle" },
  { status: "dnd", label: "Do Not Disturb" },
  { status: "offline", label: "Invisible" },
];

/** Best available name for a saved account, which may predate a profile load. */
function accountLabel(a: { display_name: string | null; username: string | null; email: string | null }): string {
  return a.display_name || a.username || a.email?.split("@")[0] || "Account";
}

interface UserPanelPopupProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  onOpenSettings: () => void;
}

/** Compact profile preview + presence switcher rendered via portal
 *  so it escapes the sidebar's overflow-hidden. Positioned just above the
 *  UserPanel bar using the anchor element's bounding rect. */
export function UserPanelPopup({ anchorRef, onClose, onOpenSettings }: UserPanelPopupProps) {
  const {
    profile, user, updateProfile, presenceMap,
    savedSessions, switchAccount, removeSavedAccount, beginAddAccount,
  } = useApp();
  const [changing, setChanging] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const [pos, setPos] = useState<{ left: number; bottom: number }>({ left: 0, bottom: 0 });

  const name = profile ? displayName(profile) : user?.email?.split("@")[0] ?? "You";
  const currentUserId = profile?.id ?? user?.id ?? null;
  const currentStatus: UserStatus = profile ? presenceMap.get(profile.id) ?? profile.status : "online";
  const statusText = statusLabel(currentStatus);

  /**
   * Every account this browser can sign into, the current one first.
   *
   * The list used to be the *other* accounts only, and was hidden entirely
   * when there were none — so a single-account user never saw the switcher at
   * all and had no way to reach "Add an Account". The current account is
   * always shown, synthesised from the live profile if storage never kept it,
   * so the section exists from the first sign-in onwards.
   */
  const accounts = (() => {
    const others = savedSessions.filter((s) => s.user_id !== currentUserId);
    const saved = savedSessions.find((s) => s.user_id === currentUserId);
    const current = currentUserId
      ? {
          user_id: currentUserId,
          email: saved?.email ?? user?.email ?? null,
          display_name: saved?.display_name ?? (profile ? displayName(profile) : null),
          username: saved?.username ?? profile?.username ?? null,
          avatar_url: profile?.avatar_url ?? saved?.avatar_url ?? null,
        }
      : null;
    return { current, others };
  })();

  const handleSwitch = useCallback(async (acct: typeof savedSessions[number]) => {
    if (switchingId) return;
    setSwitchingId(acct.user_id);
    try {
      const err = await switchAccount(acct);
      if (!err) onClose();
    } finally {
      setSwitchingId(null);
    }
  }, [switchAccount, switchingId, onClose]);

  const setStatus = useCallback(
    async (status: UserStatus) => {
      if (changing) return;
      setChanging(true);
      try {
        await updateProfile({ status } as any);
      } finally {
        setChanging(false);
      }
    },
    [changing, updateProfile],
  );

  useEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setPos({ left: r.left + 4, bottom: window.innerHeight - r.top + 8 });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
    };
  }, [anchorRef]);

  const content = (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div
        className="fixed z-40 w-72 max-h-[calc(100vh-100px)] overflow-y-auto rounded-lg bg-bg-secondary shadow-xl ring-1 ring-white/10"
        style={{ left: pos.left, bottom: pos.bottom }}
      >
        {/* Banner */}
        <div
          className="relative h-16"
          style={{
            background: profile?.accent_color
              ? `linear-gradient(to bottom, ${profile.accent_color}, transparent)`
              : "linear-gradient(to bottom, #5865f2, #3c45a0)",
          }}
        >
          {profile?.banner_url && (
            <img
              src={profile.banner_url}
              alt=""
              className="h-full w-full object-cover opacity-60"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}
        </div>

        {/* Avatar */}
        <div className="relative -mt-9 mb-1 flex justify-center px-4">
          <div className="relative">
            <Avatar profile={profile ?? { display_name: name }} size="lg" className="ring-[6px] ring-bg-secondary" />
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-[3px] border-bg-secondary ${STATUS_DOT_BG[currentStatus]}`}
            />
          </div>
        </div>

        {/* Info + settings */}
        <div className="flex items-center justify-between px-4 pb-2">
          <div>
            <p className="text-sm font-semibold text-text-normal">{name}</p>
            <p className="text-xs text-text-muted">{statusText}</p>
          </div>
          <button
            onClick={onOpenSettings}
            className="h-8 w-8 shrink-0 rounded p-1.5 text-text-muted transition-colors hover:bg-interactive-hover hover:text-text-normal"
            aria-label="Settings"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>

        {/* Status switcher */}
        <div className="border-t border-divider px-2 py-1.5">
          <p className="mb-1 px-2 text-[10px] font-bold uppercase tracking-wide text-text-muted">
            Set Status
          </p>
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.status}
              type="button"
              disabled={changing}
              onClick={() => void setStatus(opt.status)}
              className={`flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-interactive-hover ${
                currentStatus === opt.status ? "bg-interactive-selected" : ""
              } ${changing ? "opacity-50" : ""}`}
            >
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT_BG[opt.status]}`} />
              <span className="flex-1 text-text-normal">{opt.label}</span>
              {currentStatus === opt.status && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-brand">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>

        {/* Accounts */}
        <div className="border-t border-divider px-2 py-1.5">
          <div className="mb-1 flex items-center justify-between px-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted">Accounts</span>
            <button
              type="button"
              onClick={() => setManaging((m) => !m)}
              className="text-[10px] font-bold uppercase tracking-wide text-text-muted transition-colors hover:text-text-normal"
            >
              {managing ? "Done" : "Manage"}
            </button>
          </div>

          <div className="flex flex-col gap-0.5">
            {accounts.current && (
              <div className="flex items-center gap-2.5 rounded bg-interactive-selected px-2 py-1.5">
                <span className="relative shrink-0">
                  <Avatar
                    size="sm"
                    profile={{ display_name: accountLabel(accounts.current), avatar_url: accounts.current.avatar_url }}
                    className="h-7 w-7 text-xs"
                  />
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-bg-secondary ${STATUS_DOT_BG[currentStatus]}`}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-text-normal">{accountLabel(accounts.current)}</span>
                  <span className="block truncate text-[11px] text-text-muted">{accounts.current.email}</span>
                </span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-brand">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            )}

            {accounts.others.map((acct) => {
              const display = accountLabel(acct);
              const busy = switchingId === acct.user_id;
              return (
                <div
                  key={acct.user_id}
                  className="group flex items-center gap-2.5 rounded px-2 py-1.5 transition-colors hover:bg-interactive-hover"
                >
                  <button
                    type="button"
                    disabled={busy || managing}
                    onClick={() => void handleSwitch(acct)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:cursor-default"
                  >
                    <Avatar
                      size="sm"
                      profile={{ display_name: display, avatar_url: acct.avatar_url }}
                      className="h-7 w-7 text-xs"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-text-normal">{display}</span>
                      <span className="block truncate text-[11px] text-text-muted">{acct.email}</span>
                    </span>
                    {busy && (
                      <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-text-muted/40 border-t-text-muted" />
                    )}
                  </button>
                  {managing && (
                    <button
                      type="button"
                      aria-label={`Remove ${display}`}
                      title="Remove this account"
                      onClick={() => removeSavedAccount(acct.user_id)}
                      className="shrink-0 rounded p-1 text-status-dnd transition-colors hover:bg-status-dnd/15"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <circle cx="12" cy="12" r="9" /><path d="M8 12h8" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}

            <button
              type="button"
              onClick={() => { beginAddAccount(); onClose(); }}
              className="flex items-center gap-2.5 rounded px-2 py-1.5 text-left transition-colors hover:bg-interactive-hover"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-dashed border-text-muted text-text-muted">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </span>
              <span className="text-sm text-text-normal">Add an Account</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}

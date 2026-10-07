"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useApp } from "@/contexts/AppContext";
import { Avatar } from "@/components/ui/Avatar";
import { IconCheck, IconPlus, IconSettings } from "@/components/icons";
import { getAccentBackground, usesCustomAccent } from "@/lib/profileColor";
import { safeImageUrl } from "@/lib/safe-url";
import { displayName } from "@/lib/utils";
import { statusLabel } from "@/lib/presence";
import {
  STATUS_DURATION_PRESETS,
  activeStatusNote,
  expiresAtForDuration,
  presetForExpiresAt,
  statusExpiryLabel,
  type StatusDurationId,
} from "@/lib/presence";
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

function accountLabel(a: { display_name: string | null; username: string | null; email: string | null }): string {
  return a.display_name || a.username || a.email?.split("@")[0] || "Account";
}

interface UserPanelPopupProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  onOpenSettings: () => void;
  onOpenProfile?: () => void;
}

export function UserPanelPopup({ anchorRef, onClose, onOpenSettings, onOpenProfile }: UserPanelPopupProps) {
  const {
    profile, user, updateProfile, presenceMap,
    savedSessions, switchAccount, removeSavedAccount, beginAddAccount,
  } = useApp();
  const [changing, setChanging] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);

  const [customNote, setCustomNote] = useState(() => profile?.status_note ?? "");
  const [customDuration, setCustomDuration] = useState<StatusDurationId>(() =>
    presetForExpiresAt(profile?.status_expires_at),
  );
  const [savingCustom, setSavingCustom] = useState(false);
  const [pos, setPos] = useState<{ left: number; bottom: number }>({ left: 0, bottom: 0 });

  const name = profile ? displayName(profile) : user?.email?.split("@")[0] ?? "You";
  const currentUserId = profile?.id ?? user?.id ?? null;
  const currentStatus: UserStatus = profile ? presenceMap.get(profile.id) ?? profile.status : "online";
  const statusText = statusLabel(currentStatus);

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

  const saveCustomStatus = useCallback(async () => {
    if (savingCustom) return;
    const note = customNote.trim();
    setSavingCustom(true);
    try {
      await updateProfile({
        status_note: note || null,
        status_expires_at: note ? expiresAtForDuration(customDuration) : null,
      } as any);
    } finally {
      setSavingCustom(false);
    }
  }, [savingCustom, customNote, customDuration, updateProfile]);

  const clearCustomStatus = useCallback(async () => {
    if (savingCustom) return;
    setSavingCustom(true);
    try {
      await updateProfile({ status_note: null, status_expires_at: null } as any);
      setCustomNote("");
      setCustomDuration("never");
    } finally {
      setSavingCustom(false);
    }
  }, [savingCustom, updateProfile]);

  const liveNote = activeStatusNote(profile);

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

  const bannerUrl = safeImageUrl(profile?.banner_url);
  const bannerBg =
    profile && usesCustomAccent(profile)
      ? getAccentBackground(profile)
      : "linear-gradient(135deg, color-mix(in srgb, var(--color-brand) 52%, var(--color-bg-tertiary)) 0%, color-mix(in srgb, var(--color-brand) 14%, var(--color-bg-tertiary)) 100%)";
  const sectionLabel = "px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted/80";
  const row = "flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2 text-left text-[13.5px] transition-colors hover:bg-interactive-hover";

  const content = (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div
        className="modal-pop fixed z-40 max-h-[calc(100vh-100px)] w-[320px] overflow-y-auto rounded-[20px] border border-divider bg-overlay-panel shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)]"
        style={{ left: pos.left, bottom: pos.bottom }}
      >
        <div className="h-[84px] overflow-hidden" style={{ background: bannerBg }}>
          {bannerUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={bannerUrl}
              alt=""
              className="h-full w-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}
        </div>

        <div className="px-4">
          <div className="flex items-end justify-between gap-2">
            <div className="relative -mt-10 shrink-0 rounded-full bg-overlay-panel p-[4px]">
              <Avatar profile={profile ?? { display_name: name }} size="lg" />
              <span
                className={`absolute bottom-1 right-1 h-[18px] w-[18px] rounded-full border-[3px] border-overlay-panel ${STATUS_DOT_BG[currentStatus]}`}
              />
            </div>
            <div className="flex shrink-0 items-center gap-1.5 pb-1">
              {onOpenProfile && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenProfile();
                  }}
                  className="inline-flex h-8 items-center rounded-[10px] border border-divider px-3 text-[13px] font-medium text-text-normal transition-colors hover:bg-interactive-hover"
                >
                  View profile
                </button>
              )}
              <button
                type="button"
                onClick={onOpenSettings}
                className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-divider text-text-muted transition-colors hover:bg-interactive-hover hover:text-text-normal"
                aria-label="Settings"
                title="Settings"
              >
                <IconSettings size={16} />
              </button>
            </div>
          </div>

          <div className="mt-2 pb-3">
            <p className="truncate text-[17px] font-semibold tracking-[-0.01em] text-text-normal">{name}</p>
            <p className="truncate text-[13px] text-text-muted">
              {profile?.username ? `@${profile.username} · ` : ""}
              {statusText}
            </p>
          </div>
        </div>

        <div className="border-t border-divider px-3 py-3">
          <p className={sectionLabel}>Custom status</p>
          <div className="px-1">
            <input
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              placeholder="What are you up to?"
              maxLength={128}
              className="h-9 w-full rounded-[10px] border border-divider bg-bg-accent px-3 text-[13.5px] text-text-normal outline-none transition-[border-color,box-shadow] placeholder:text-text-muted/70 focus:border-brand/50 focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-brand)_14%,transparent)]"
            />
            <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Clear custom status after">
              {STATUS_DURATION_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setCustomDuration(preset.id)}
                  aria-pressed={customDuration === preset.id}
                  className={`rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium transition-colors ${
                    customDuration === preset.id
                      ? "border-brand/60 bg-brand/15 text-text-normal"
                      : "border-divider text-text-muted hover:bg-interactive-hover hover:text-text-normal"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="mt-2.5 flex gap-1.5">
              <button
                type="button"
                disabled={savingCustom}
                onClick={() => void saveCustomStatus()}
                className="h-8 flex-1 rounded-[10px] bg-text-normal text-[13px] font-semibold text-bg-primary transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {savingCustom ? "Saving…" : "Set status"}
              </button>
              {(liveNote || customNote.trim()) && (
                <button
                  type="button"
                  disabled={savingCustom}
                  onClick={() => void clearCustomStatus()}
                  className="h-8 rounded-[10px] border border-divider px-3 text-[13px] text-text-muted transition-colors hover:bg-interactive-hover hover:text-text-normal disabled:opacity-50"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-divider px-3 py-3">
          <p className={sectionLabel}>Presence</p>
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.status}
              type="button"
              disabled={changing}
              aria-pressed={currentStatus === opt.status}
              onClick={() => void setStatus(opt.status)}
              className={`${row} ${currentStatus === opt.status ? "bg-interactive-selected" : ""} ${changing ? "opacity-50" : ""}`}
            >
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT_BG[opt.status]}`} />
              <span className="flex-1 text-text-normal">{opt.label}</span>
              {currentStatus === opt.status && <IconCheck size={15} className="text-text-normal" />}
            </button>
          ))}
        </div>

        <div className="border-t border-divider px-3 py-3">
          <div className="flex items-center justify-between pr-1">
            <p className={sectionLabel}>Accounts</p>
            <button
              type="button"
              onClick={() => setManaging((m) => !m)}
              className="pb-1 text-[12px] font-medium text-text-muted transition-colors hover:text-text-normal"
            >
              {managing ? "Done" : "Manage"}
            </button>
          </div>

          <div className="flex flex-col gap-px">
            {accounts.current && (
              <div className="flex items-center gap-2.5 rounded-[10px] bg-interactive-selected px-2 py-1.5">
                <span className="relative shrink-0">
                  <Avatar
                    size="sm"
                    profile={{ display_name: accountLabel(accounts.current), avatar_url: accounts.current.avatar_url }}
                    className="h-7 w-7 text-xs"
                  />
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-overlay-panel ${STATUS_DOT_BG[currentStatus]}`}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-text-normal">{accountLabel(accounts.current)}</span>
                  <span className="block truncate text-[11.5px] text-text-muted">{accounts.current.email}</span>
                </span>
                <IconCheck size={15} className="shrink-0 text-text-normal" />
              </div>
            )}

            {accounts.others.map((acct) => {
              const display = accountLabel(acct);
              const busy = switchingId === acct.user_id;
              return (
                <div
                  key={acct.user_id}
                  className="group flex items-center gap-2.5 rounded-[10px] px-2 py-1.5 transition-colors hover:bg-interactive-hover"
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
                      <span className="block truncate text-[13.5px] text-text-normal">{display}</span>
                      <span className="block truncate text-[11.5px] text-text-muted">{acct.email}</span>
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
                      className="shrink-0 rounded-full p-1 text-status-dnd transition-colors hover:bg-status-dnd/15"
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
              className={row}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-dashed border-text-muted/60 text-text-muted">
                <IconPlus size={14} />
              </span>
              <span className="font-medium text-text-normal">Add an account</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}

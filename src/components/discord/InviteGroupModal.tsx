"use client";

import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
import { usePresence } from "@/hooks/usePresence";

import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Avatar } from "@/components/ui/Avatar";
import { StatusDot } from "@/components/ui/StatusDot";
import { displayName } from "@/lib/utils";
import { presenceStatusFor } from "@/lib/presence";
import { IconClose } from "@/components/icons";
import type { Profile } from "@/lib/supabase/types";
import { useI18n } from "@/contexts/I18nContext";

interface InviteGroupModalProps {
  open: boolean;
  groupId: string | null;
  members: Profile[];
  onClose: () => void;
}

/** Matches add_group_members on the server: ten people per group. */
const GROUP_LIMIT = 10;

/*
 Add friends to an existing group. Same layout as Create Group DM: a search
 box that holds the picked friends as chips, rows with a check on the right,
 and one button at the bottom. Friends already in the group are left out.
*/
export function InviteGroupModal({ open, groupId, members, onClose }: InviteGroupModalProps) {
  const { t } = useI18n();
  const { friends, inviteToGroup, presenceMap } = useApp();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSearch("");
      setSelected([]);
      setError(null);
    }
  }, [open, groupId]);

  const available = useMemo(
    () => friends.filter((f) => !members.some((m) => m.id === f.id)),
    [friends, members],
  );

  useOverlayDismiss(onClose, open);
  const { mounted, exiting } = usePresence(open);
  const lastGroupIdRef = useRef<string | null>(null);
  if (groupId) lastGroupIdRef.current = groupId;
  const shownGroupId = groupId ?? lastGroupIdRef.current;

  if (!mounted || !shownGroupId) return null;

  const left = Math.max(0, GROUP_LIMIT - members.length - selected.length);
  const q = search.trim().toLowerCase();
  const shown = available.filter((f) => !q || `${displayName(f)} ${f.username ?? ""}`.toLowerCase().includes(q));
  const picked = selected.map((id) => friends.find((f) => f.id === id)).filter((f): f is Profile => !!f);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : left > 0 ? [...prev, id] : prev));
    setSearch("");
    searchRef.current?.focus();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected.length) return;
    setLoading(true);
    setError(null);
    const err = await inviteToGroup(shownGroupId!, selected);
    setLoading(false);
    if (err) setError(err);
    else onClose();
  }

  return (
    <div className={`fixed inset-0 z-[90] flex items-center justify-center bg-black/85 p-4 overlay-fade${exiting ? " overlay-fade-out" : ""}`}>
      <button type="button" aria-label={t("Close")} className="absolute inset-0 cursor-default" onClick={onClose} />
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label={t("Add friends to group")}
        className={`classic-modal${exiting ? " modal-pop-out" : ""} relative flex max-h-[calc(100dvh-32px)] w-full max-w-[440px] flex-col overflow-hidden rounded-lg bg-bg-primary shadow-[var(--elevation-high)]`}
      >
        <div className="px-4 pt-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-[20px] font-semibold leading-6 text-header-primary">{t("Add friends to group")}</h2>
              <p className="mt-1 text-[12px] text-header-secondary">
                {left === 0
                  ? t("This group is full — 10 members max.")
                  : t(left === 1 ? "You can add {count} more friend." : "You can add {count} more friends.", { count: left })}
              </p>
            </div>
            <button type="button" aria-label={t("Close")} onClick={onClose} className="text-interactive-normal hover:text-interactive-active">
              <IconClose size={22} />
            </button>
          </div>

          <div
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) {
                e.preventDefault();
                searchRef.current?.focus();
              }
            }}
            className="mt-4 flex max-h-[96px] min-h-[40px] cursor-text flex-wrap items-center gap-1 overflow-y-auto rounded-[3px] bg-bg-tertiary px-1.5 py-1"
          >
            {picked.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => toggle(f.id)}
                aria-label={t("Remove {name}", { name: displayName(f) })}
                className="flex h-[26px] items-center gap-1 rounded-[3px] bg-bg-secondary-alt px-1.5 text-[14px] text-header-primary hover:bg-interactive-hover"
              >
                {displayName(f)}
                <IconClose size={12} className="text-interactive-normal" />
              </button>
            ))}
            <input
              ref={searchRef}
              autoFocus
              aria-label={t("Search friends")}
              placeholder={picked.length ? "" : t("Search friends by name or username")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Backspace" && !search && selected.length) setSelected((s) => s.slice(0, -1));
                if (e.key === "Enter" && search && shown.length === 1) {
                  e.preventDefault();
                  toggle(shown[0].id);
                }
              }}
              className="h-[26px] min-w-[120px] flex-1 bg-transparent px-1 text-[16px] text-text-normal outline-none placeholder:text-text-muted"
            />
          </div>
        </div>

        <div className="channel-scroll mt-2 min-h-[120px] flex-1 overflow-y-auto px-2 pb-2">
          {available.length === 0 ? (
            <p className="px-2 py-6 text-center text-[14px] text-header-secondary">
              {friends.length === 0 ? t("You don’t have any friends to add yet.") : t("All your friends are already in this group.")}
            </p>
          ) : shown.length === 0 ? (
            <p className="px-2 py-6 text-center text-[14px] text-header-secondary">{t("No friends match that.")}</p>
          ) : (
            shown.map((f) => {
              const on = selected.includes(f.id);
              const blocked = !on && left === 0;
              return (
                <label
                  key={f.id}
                  className={`flex h-[42px] items-center gap-3 rounded-[4px] px-2 ${blocked ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-interactive-hover"}`}
                >
                  <span className="relative shrink-0">
                    <Avatar profile={f} size="sm" />
                    <StatusDot status={presenceStatusFor(f, presenceMap)} size={10} ring="var(--bg-primary)" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="text-[16px] font-medium text-header-primary">{displayName(f)}</span>
                    {f.username && <span className="ml-1.5 text-[14px] text-header-secondary">{f.username}</span>}
                  </span>
                  <input type="checkbox" className="peer sr-only" checked={on} disabled={blocked} onChange={() => toggle(f.id)} />
                  <span
                    aria-hidden
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[#00a8fc] ${
                      on ? "border-brand bg-brand text-white" : "border-interactive-normal/60 text-transparent"
                    }`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M5 12.5 10 17.5 19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </label>
              );
            })
          )}
        </div>

        <div className="border-t border-bg-tertiary p-4">
          {error && <p className="mb-3 text-[14px] text-status-dnd">{error}</p>}
          <button
            type="submit"
            disabled={loading || selected.length === 0}
            className="h-[38px] w-full rounded-[3px] bg-brand text-[14px] font-medium text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? t("Adding…")
              : selected.length === 0
                ? t("Select friends to add")
                : t(selected.length === 1 ? "Add {count} friend" : "Add {count} friends", { count: selected.length })}
          </button>
        </div>
      </form>
    </div>
  );
}

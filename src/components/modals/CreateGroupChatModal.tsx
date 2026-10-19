"use client";

import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
import { usePresence } from "@/hooks/usePresence";

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Avatar } from "@/components/ui/Avatar";
import { StatusDot } from "@/components/ui/StatusDot";
import { displayName } from "@/lib/utils";
import { presenceStatusFor } from "@/lib/presence";
import { IconClose } from "@/components/icons";
import type { Profile } from "@/lib/supabase/types";

interface CreateGroupChatModalProps {
  open: boolean;
  onClose: () => void;
}

/** Group DMs hold ten people: you and nine friends. */
const MAX_PICKS = 9;

/*
 Discord's "Select Friends" popout: a count line, a search box that also
 holds the picked friends as chips (Backspace removes the last one), rows
 with a check on the right, and one full-width create button.
*/
export function CreateGroupChatModal({ open, onClose }: CreateGroupChatModalProps) {
  const { friends, createGroupChat, presenceMap } = useApp();
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSearch("");
      setError(null);
    }
  }, [open]);
  useOverlayDismiss(onClose, open);
  const { mounted, exiting } = usePresence(open);

  if (!mounted) return null;

  const left = MAX_PICKS - selected.length;
  const q = search.trim().toLowerCase();
  const shown = friends.filter((f) => !q || `${displayName(f)} ${f.username ?? ""}`.toLowerCase().includes(q));
  const picked = selected.map((id) => friends.find((f) => f.id === id)).filter((f): f is Profile => !!f);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < MAX_PICKS ? [...prev, id] : prev));
    setSearch("");
    searchRef.current?.focus();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (selected.length === 0) return;
    setLoading(true);
    setError(null);
    // No name given: use the members' names, as Discord does.
    const groupName = name.trim() || picked.map((f) => displayName(f)).join(", ").slice(0, 64);
    const err = await createGroupChat(groupName, selected);
    setLoading(false);
    if (err) setError(err);
    else {
      setName("");
      setSelected([]);
      onClose();
    }
  }

  return (
    <div className={`fixed inset-0 z-[90] flex items-center justify-center bg-black/85 p-4 overlay-fade${exiting ? " overlay-fade-out" : ""}`}>
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default" onClick={onClose} />
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label="Select Friends"
        className={`classic-modal${exiting ? " modal-pop-out" : ""} relative flex max-h-[calc(100dvh-32px)] w-full max-w-[440px] flex-col overflow-hidden rounded-lg bg-bg-primary shadow-[var(--elevation-high)]`}
      >
        <div className="px-4 pt-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-[20px] font-semibold leading-6 text-header-primary">Select Friends</h2>
              <p className="mt-1 text-[12px] text-header-secondary">
                {left === 0 ? "This group has a 10 member limit." : `You can add ${left} more friend${left === 1 ? "" : "s"}.`}
              </p>
            </div>
            <button type="button" aria-label="Close" onClick={onClose} className="text-interactive-normal hover:text-interactive-active">
              <IconClose size={22} />
            </button>
          </div>

          {/* Search, with picked friends as chips inside it. */}
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
                aria-label={`Remove ${displayName(f)}`}
                className="flex h-[26px] items-center gap-1 rounded-[3px] bg-bg-secondary-alt px-1.5 text-[14px] text-header-primary hover:bg-interactive-hover"
              >
                {displayName(f)}
                <IconClose size={12} className="text-interactive-normal" />
              </button>
            ))}
            <input
              ref={searchRef}
              autoFocus
              aria-label="Search friends"
              placeholder={picked.length ? "" : "Type the username of a friend"}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Backspace" && !search && selected.length) setSelected((s) => s.slice(0, -1));
              }}
              className="h-[26px] min-w-[120px] flex-1 bg-transparent px-1 text-[16px] text-text-normal outline-none placeholder:text-text-muted"
            />
          </div>
        </div>

        <div className="channel-scroll mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {friends.length === 0 ? (
            <p className="px-2 py-6 text-center text-[14px] text-header-secondary">You don&apos;t have any friends to add yet.</p>
          ) : shown.length === 0 ? (
            <p className="px-2 py-6 text-center text-[14px] text-header-secondary">No friends match that.</p>
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
          {selected.length > 1 && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={64}
              aria-label="Group name"
              placeholder="Group name (optional)"
              className="mb-3 h-10 w-full rounded-[3px] border border-transparent bg-bg-tertiary px-2.5 text-[16px] text-text-normal outline-none placeholder:text-text-muted focus:border-[#00a8fc]"
            />
          )}
          {error && <p className="mb-3 text-[14px] text-status-dnd">{error}</p>}
          <button
            type="submit"
            disabled={loading || selected.length === 0}
            className="h-[38px] w-full rounded-[3px] bg-brand text-[14px] font-medium text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Creating…" : "Create Group DM"}
          </button>
        </div>
      </form>
    </div>
  );
}

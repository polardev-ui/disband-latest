"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "@/contexts/AppContext";
import { usePresence } from "@/hooks/usePresence";
import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
import { Avatar } from "@/components/ui/Avatar";
import { IconGroup, IconHash, IconSpeaker } from "@/components/icons";
import { displayName, serverInitials } from "@/lib/utils";
import { safeImageUrl } from "@/lib/safe-url";

type Result =
  | { kind: "dm"; id: string; label: string; sub: string; profileId: string }
  | { kind: "group"; id: string; label: string; sub: string }
  | { kind: "server"; id: string; label: string; sub: string; icon: string | null }
  | { kind: "channel"; id: string; label: string; sub: string; voice: boolean };

/**
 * The classic Quick Switcher (Ctrl/⌘+K): one box to jump to any DM, group,
 * space or channel. Prefix with @ for people, # for channels, * for spaces.
 */
export function QuickSwitcher({ open, onClose }: { open: boolean; onClose: () => void }) {
  const app = useApp();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { mounted, exiting } = usePresence(open);
  useOverlayDismiss(onClose, open);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const results = useMemo<Result[]>(() => {
    const raw = query.trim();
    const prefix = raw[0];
    const q = (prefix === "@" || prefix === "#" || prefix === "*" ? raw.slice(1) : raw).toLowerCase();
    const want = (k: Result["kind"]) =>
      prefix === "@" ? k === "dm" : prefix === "#" ? k === "channel" : prefix === "*" ? k === "server" : true;
    const match = (s: string) => !q || s.toLowerCase().includes(q);
    const out: Result[] = [];
    if (want("dm")) {
      for (const f of app.friends) {
        const name = displayName(f);
        if (match(`${name} ${f.username ?? ""}`)) out.push({ kind: "dm", id: f.id, label: name, sub: f.username ? `@${f.username}` : "", profileId: f.id });
      }
    }
    if (want("group")) {
      for (const g of app.groupChats) if (match(g.name)) out.push({ kind: "group", id: g.id, label: g.name, sub: `${g.members.length} members` });
    }
    if (want("channel")) {
      for (const c of app.channels) if (match(c.name)) out.push({ kind: "channel", id: c.id, label: c.name, sub: app.activeServer?.name ?? "", voice: c.type === "voice" });
    }
    if (want("server")) {
      for (const sv of app.servers) if (match(sv.name)) out.push({ kind: "server", id: sv.id, label: sv.name, sub: "Space", icon: sv.icon_url });
    }
    return out.slice(0, 40);
  }, [query, app.friends, app.groupChats, app.channels, app.servers, app.activeServer]);

  useEffect(() => setIndex(0), [query]);

  const go = (r: Result | undefined) => {
    if (!r) return;
    if (r.kind === "dm") void app.openDmWithFriend(r.profileId);
    else if (r.kind === "group") void app.selectGroupChat(r.id);
    else if (r.kind === "server") void app.selectServer(r.id);
    else app.selectChannel(r.id);
    onClose();
  };

  if (!mounted || typeof document === "undefined") return null;
  const friendById = new Map(app.friends.map((f) => [f.id, f]));

  return createPortal(
    <div className="fixed inset-0 z-[160] flex items-start justify-center px-4 pt-[18vh]">
      <button type="button" aria-label="Close" className={`overlay-fade${exiting ? " overlay-fade-out" : ""} absolute inset-0 bg-overlay-scrim-strong`} onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Quick Switcher"
        className={`classic-modal${exiting ? " classic-modal-out" : ""} relative w-full max-w-[570px] rounded-lg bg-bg-primary px-8 pb-4 pt-5 shadow-[var(--elevation-high)]`}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndex((i) => Math.min(i + 1, Math.max(0, results.length - 1)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              go(results[index]);
            }
          }}
          placeholder="Where would you like to go?"
          aria-label="Search for spaces, channels or DMs"
          className="h-[70px] w-full rounded-[4px] bg-bg-tertiary px-4 text-[20px] text-text-normal outline-none placeholder:text-text-muted"
        />
        <div className="mt-2 max-h-[300px] overflow-y-auto" role="listbox">
          {results.length === 0 ? (
            <p className="py-6 text-center text-[14px] text-text-muted">Can&apos;t find what you&apos;re looking for?</p>
          ) : (
            results.map((r, i) => {
              const active = i === index;
              return (
                <button
                  key={`${r.kind}:${r.id}`}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => go(r)}
                  className={`flex h-[34px] w-full items-center gap-2.5 rounded-[4px] px-2 text-left ${active ? "bg-interactive-selected text-interactive-active" : "text-interactive-normal"}`}
                >
                  {r.kind === "dm" ? (
                    <Avatar profile={friendById.get(r.profileId) ?? { display_name: r.label }} size="sm" className="!h-5 !w-5 !text-[9px]" />
                  ) : r.kind === "group" ? (
                    <IconGroup size={18} />
                  ) : r.kind === "server" ? (
                    safeImageUrl(r.icon) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={safeImageUrl(r.icon)!} alt="" className="h-5 w-5 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-bg-secondary text-[8px] font-semibold">{serverInitials(r.label)}</span>
                    )
                  ) : r.voice ? (
                    <IconSpeaker size={18} />
                  ) : (
                    <IconHash size={18} />
                  )}
                  <span className="truncate text-[16px] font-medium">{r.label}</span>
                  {r.sub && <span className="ml-1 truncate text-[12px] text-text-muted">{r.sub}</span>}
                  {r.kind === "server" && <span className="ml-auto shrink-0 text-[12px] font-semibold uppercase text-text-muted">Space</span>}
                </button>
              );
            })
          )}
        </div>
        <p className="mt-3 text-[12px] font-semibold uppercase leading-4 text-[#23a55a]">
          Protip: <span className="font-medium normal-case text-text-muted">Start searches with @ for people, # for channels or * for spaces.</span>
        </p>
      </div>
    </div>,
    document.body,
  );
}

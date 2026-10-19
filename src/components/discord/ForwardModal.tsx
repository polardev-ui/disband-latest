"use client";

import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
import { usePresence } from "@/hooks/usePresence";

import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useApp } from "@/contexts/AppContext";
import { Avatar } from "@/components/ui/Avatar";
import { displayName } from "@/lib/utils";

interface ForwardModalProps {
  open: boolean;
  onClose: () => void;
  onForward: (dest: ForwardDestination) => void;
}

export interface ForwardDestination {
  kind: "dm" | "group" | "channel";
  id: string;
  label: string;
}

export function ForwardModal({ open, onClose, onForward }: ForwardModalProps) {
  const app = useApp();
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();

  const destinations = useMemo<ForwardDestination[]>(() => {
    const results: ForwardDestination[] = [];

    for (const f of app.friends) {
      const name = displayName(f);
      if (q && !name.toLowerCase().includes(q) && !f.username?.toLowerCase().includes(q)) continue;
      results.push({ kind: "dm", id: f.id, label: name });
    }

    for (const g of app.groupChats) {
      if (q && !g.name.toLowerCase().includes(q)) continue;
      results.push({ kind: "group", id: g.id, label: g.name });
    }
    return results;
  }, [app.friends, app.groupChats, q]);

  useOverlayDismiss(onClose, open);
  const { mounted, exiting } = usePresence(open);

  if (!mounted) return null;

  const handleSelect = (dest: ForwardDestination) => {
    onForward(dest);
    onClose();
  };

  const content = (
    <div className={`fixed inset-0 z-[90] flex items-end justify-center p-2 sm:items-center sm:p-4 overlay-fade${exiting ? " overlay-fade-out" : ""}`}>
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default bg-black/85" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Forward message"
        className={`classic-modal${exiting ? " modal-pop-out" : ""} relative flex max-h-[min(640px,calc(100dvh-32px))] w-full max-w-[440px] flex-col overflow-hidden rounded-lg bg-bg-primary shadow-[var(--elevation-high)]`}
      >
        <div className="px-4 pt-4">
          <h2 className="text-[20px] font-semibold leading-6 text-header-primary">Forward To</h2>
          <p className="mt-1 text-[14px] text-header-secondary">Select where you want to share this message.</p>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            aria-label="Search friends and groups"
            autoFocus
            className="mt-4 h-10 w-full rounded-[3px] border border-transparent bg-bg-tertiary px-2.5 text-[16px] text-text-normal outline-none placeholder:text-text-muted focus:border-[#00a8fc]"
          />
        </div>

        <div className="channel-scroll mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {destinations.length === 0 ? (
            <p className="py-8 text-center text-[14px] text-header-secondary">
              {q ? "No results found." : "No conversations yet."}
            </p>
          ) : (
            destinations.map((dest) => (
              <button
                key={`${dest.kind}-${dest.id}`}
                type="button"
                onClick={() => handleSelect(dest)}
                className="group flex h-[44px] w-full items-center gap-3 rounded-[4px] px-2 text-left hover:bg-interactive-hover"
              >
                {dest.kind === "group" ? (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-[14px] font-semibold text-white">
                    {dest.label.charAt(0).toUpperCase()}
                  </span>
                ) : (
                  <Avatar
                    profile={app.friends.find((f) => f.id === dest.id) ?? { display_name: dest.label }}
                    size="sm"
                  />
                )}
                <span className="min-w-0 flex-1 truncate text-[16px] font-medium text-header-primary">{dest.label}</span>
                <span className="shrink-0 text-[12px] text-header-secondary">{dest.kind === "dm" ? "Direct Message" : "Group DM"}</span>
                <span className="ml-2 hidden h-8 shrink-0 items-center rounded-[3px] bg-brand px-3 text-[14px] font-medium text-white group-hover:flex">
                  Send
                </span>
              </button>
            ))
          )}
        </div>
        <div className="flex justify-end bg-bg-secondary p-4">
          <button type="button" onClick={onClose} className="h-[38px] px-4 text-[14px] font-medium text-white hover:underline">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}

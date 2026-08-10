"use client";

import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useApp } from "@/contexts/AppContext";
import { Avatar } from "@/components/ui/Avatar";
import { displayName } from "@/lib/utils";
import { IconHash } from "@/components/icons";
import type { Profile, Channel } from "@/lib/supabase/types";

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

  if (!open) return null;

  const handleSelect = (dest: ForwardDestination) => {
    onForward(dest);
    onClose();
  };

  const content = (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-sm rounded-t-xl border border-divider bg-bg-secondary shadow-2xl sm:inset-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl">
        <div className="border-b border-divider px-4 py-3">
          <h3 className="text-sm font-semibold text-text-normal">Forward message</h3>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search friends and groups..."
            autoFocus
            className="mt-2 w-full rounded bg-bg-primary px-3 py-2 text-sm text-text-normal placeholder:text-text-muted outline-none"
          />
        </div>

        <div className="max-h-72 overflow-y-auto p-2">
          {destinations.length === 0 ? (
            <p className="py-8 text-center text-xs text-text-muted">
              {q ? "No matches found" : "No conversations available"}
            </p>
          ) : (
            destinations.map((dest) => (
              <button
                key={`${dest.kind}-${dest.id}`}
                type="button"
                onClick={() => handleSelect(dest)}
                className="flex w-full items-center gap-3 rounded px-2 py-2 text-left transition-colors hover:bg-interactive-hover"
              >
                {dest.kind === "group" ? (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/20 text-xs font-bold text-brand">
                    {dest.label.charAt(0).toUpperCase()}
                  </span>
                ) : (
                  <Avatar
                    profile={app.friends.find((f) => f.id === dest.id) ?? { display_name: dest.label }}
                    size="sm"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-normal">{dest.label}</p>
                  <p className="text-xs text-text-muted">
                    {dest.kind === "dm" ? "Direct Message" : "Group Chat"}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}

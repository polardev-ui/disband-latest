"use client";

import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Avatar } from "@/components/ui/Avatar";
import { displayName } from "@/lib/utils";
import { IconClose } from "@/components/icons";
import type { Profile } from "@/lib/supabase/types";

interface CreateGroupChatModalProps {
  open: boolean;
  onClose: () => void;
}

export function CreateGroupChatModal({ open, onClose }: CreateGroupChatModalProps) {
  const { friends, createGroupChat } = useApp();
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 9) next.add(id);
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const err = await createGroupChat(name.trim(), [...selected]);
    setLoading(false);
    if (err) setError(err);
    else {
      setName("");
      setSelected(new Set());
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-lg bg-bg-secondary p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-text-normal">Create Group Chat</h2>
          <button type="button" onClick={onClose} className="text-text-muted hover:text-text-normal">
            <IconClose size={20} />
          </button>
        </div>

        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-bold uppercase text-text-muted">Group name</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={64}
            className="w-full rounded bg-bg-accent px-3 py-2 text-sm text-text-normal outline-none focus:ring-2 focus:ring-brand"
          />
        </label>

        <p className="mb-2 text-xs font-bold uppercase text-text-muted">
          Add friends ({selected.size}/9) — 10 members max
        </p>
        <div className="mb-4 max-h-48 space-y-1 overflow-y-auto rounded border border-divider p-2">
          {friends.map((f: Profile) => (
            <label key={f.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-interactive-hover">
              <input
                type="checkbox"
                checked={selected.has(f.id)}
                onChange={() => toggle(f.id)}
                disabled={!selected.has(f.id) && selected.size >= 9}
                className="accent-brand"
              />
              <Avatar profile={f} size="sm" />
              <span className="text-sm">{displayName(f)}</span>
            </label>
          ))}
          {friends.length === 0 && <p className="text-sm text-text-muted">Add friends first</p>}
        </div>

        {error && <p className="mb-3 text-sm text-status-dnd">{error}</p>}

        <button
          type="submit"
          disabled={loading || selected.size === 0 || !name.trim()}
          className="w-full rounded bg-brand py-2.5 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
        >
          {loading ? "Creating…" : "Create Group"}
        </button>
      </form>
    </div>
  );
}

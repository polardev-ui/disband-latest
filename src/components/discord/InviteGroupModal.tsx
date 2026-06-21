"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Avatar } from "@/components/ui/Avatar";
import { displayName } from "@/lib/utils";
import { IconClose } from "@/components/icons";
import type { Profile } from "@/lib/supabase/types";

interface InviteGroupModalProps {
  open: boolean;
  groupId: string | null;
  members: Profile[];
  onClose: () => void;
}

export function InviteGroupModal({ open, groupId, members, onClose }: InviteGroupModalProps) {
  const { friends, inviteToGroup } = useApp();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const available = useMemo(
    () => friends.filter((f) => !members.some((m) => m.id === f.id)),
    [friends, members],
  );

  if (!open || !groupId) return null;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (members.length + next.size < 10) next.add(id);
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const err = await inviteToGroup(groupId!, [...selected]);
    setLoading(false);
    if (err) setError(err);
    else {
      setSelected(new Set());
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-lg bg-bg-secondary p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Invite friends</h2>
          <button type="button" onClick={onClose}><IconClose size={20} /></button>
        </div>
        <p className="mb-3 text-xs text-text-muted">{members.length}/10 members · pick friends to add</p>
        <div className="mb-4 max-h-48 space-y-1 overflow-y-auto rounded border border-divider p-2">
          {available.map((f) => (
            <label key={f.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-interactive-hover">
              <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggle(f.id)} className="accent-brand" />
              <Avatar profile={f} size="sm" />
              <span className="text-sm">{displayName(f)}</span>
            </label>
          ))}
          {available.length === 0 && <p className="text-sm text-text-muted">All friends are already in this group</p>}
        </div>
        {error && <p className="mb-2 text-sm text-status-dnd">{error}</p>}
        <button
          type="submit"
          disabled={loading || selected.size === 0}
          className="w-full rounded bg-brand py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Inviting…" : `Invite ${selected.size || ""} friend${selected.size === 1 ? "" : "s"}`}
        </button>
      </form>
    </div>
  );
}

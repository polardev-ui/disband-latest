"use client";

import { Avatar } from "@/components/ui/Avatar";
import type { Profile } from "@/lib/supabase/types";

interface DmUnreadBadgeProps {
  friend: Profile;
  count: number;
  onClick: () => void;
}

export function DmUnreadBadge({ friend, count, onClick }: DmUnreadBadgeProps) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);

  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed left-4 top-4 z-[90] flex items-center gap-3 rounded-[4px] border border-black/40 bg-bg-floating py-1.5 pl-1.5 pr-3 shadow-[var(--elevation-high)] transition-colors hover:bg-bg-secondary"
      aria-label={`${count} unread messages`}
    >
      <div className="relative">
        <Avatar profile={friend} size="sm" className="h-11 w-11" />
        <span className="absolute -bottom-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-status-dnd px-1 text-[11px] font-bold text-white ring-2 ring-bg-secondary">
          {label}
        </span>
      </div>
      <span className="text-[14px] font-medium text-text-normal">New message</span>
    </button>
  );
}

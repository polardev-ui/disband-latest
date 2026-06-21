"use client";

import { Avatar } from "@/components/ui/Avatar";
import type { Profile } from "@/lib/supabase/types";

interface DmUnreadBadgeProps {
  friend: Profile;
  count: number;
  onClick: () => void;
}

/** Floating DM notification — top-left PFP with unread count badge. */
export function DmUnreadBadge({ friend, count, onClick }: DmUnreadBadgeProps) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);

  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed left-4 top-4 z-[90] flex items-center gap-3 rounded-full border border-black/30 bg-bg-secondary/95 py-1.5 pl-1.5 pr-4 shadow-xl backdrop-blur-md transition-transform hover:scale-[1.02]"
      aria-label={`${count} unread messages`}
    >
      <div className="relative">
        <Avatar profile={friend} size="sm" className="h-11 w-11" />
        <span className="absolute -bottom-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-status-dnd px-1 text-[11px] font-bold text-white ring-2 ring-bg-secondary">
          {label}
        </span>
      </div>
      <span className="text-sm font-medium text-text-normal">New message</span>
    </button>
  );
}

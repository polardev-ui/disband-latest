"use client";

import { Avatar } from "@/components/ui/Avatar";
import { displayName } from "@/lib/utils";
import type { Profile } from "@/lib/supabase/types";

interface GroupMemberListProps {
  members: Profile[];
  ownerId: string;
  inCallUserIds?: Set<string>;
  currentUserId?: string | null;
  onMemberClick?: (profile: Profile) => void;
}

export function GroupMemberList({
  members,
  ownerId,
  inCallUserIds,
  currentUserId,
  onMemberClick,
}: GroupMemberListProps) {
  const inCall = members.filter((m) => inCallUserIds?.has(m.id));
  const notInCall = members.filter((m) => !inCallUserIds?.has(m.id));

  function Row({ m }: { m: Profile }) {
    const inVoice = inCallUserIds?.has(m.id);
    return (
      <button
        type="button"
        onClick={() => onMemberClick?.(m)}
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-interactive-hover"
      >
        <div className="relative">
          <Avatar profile={m} size="sm" />
          {inVoice && (
            <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-bg-secondary bg-status-online" />
          )}
        </div>
        <span className="truncate text-sm text-text-normal">
          {displayName(m)}
          {m.id === ownerId && <span className="ml-1 text-[10px] text-text-muted">owner</span>}
          {m.id === currentUserId && <span className="ml-1 text-[10px] text-brand">you</span>}
        </span>
        {inVoice && <span className="ml-auto text-[10px] font-semibold text-status-online">In call</span>}
      </button>
    );
  }

  return (
    <aside className="hidden w-60 shrink-0 flex-col overflow-y-auto bg-bg-secondary lg:flex">
      <div className="p-4">
        {inCall.length > 0 && (
          <section className="mb-4">
            <p className="mb-1 px-2 text-xs font-bold uppercase text-status-online">
              In Voice — {inCall.length}
            </p>
            {inCall.map((m) => <Row key={m.id} m={m} />)}
          </section>
        )}
        <section>
          <p className="mb-1 px-2 text-xs font-bold uppercase text-text-muted">
            Members — {members.length}
          </p>
          {notInCall.map((m) => <Row key={m.id} m={m} />)}
        </section>
      </div>
    </aside>
  );
}

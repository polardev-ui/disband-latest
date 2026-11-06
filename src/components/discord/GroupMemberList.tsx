"use client";

import { Avatar } from "@/components/ui/Avatar";
import { displayName } from "@/lib/utils";
import type { Profile } from "@/lib/supabase/types";
import { useI18n } from "@/contexts/I18nContext";
import { useApp } from "@/contexts/AppContext";
import { StatusDot } from "@/components/ui/StatusDot";
import { presenceStatusFor } from "@/lib/presence";
import { IconCrown, IconUserPlus } from "@/components/icons";

interface GroupMemberListProps {
  members: Profile[];
  ownerId: string;
  inCallUserIds?: Set<string>;
  currentUserId?: string | null;
  onMemberClick?: (profile: Profile) => void;
  onMemberContext?: (profile: Profile, x: number, y: number) => void;
  onInvite?: () => void;
}

export function GroupMemberList({
  members,
  ownerId,
  inCallUserIds,
  currentUserId,
  onMemberClick,
  onMemberContext,
  onInvite,
}: GroupMemberListProps) {
  const { presenceMap } = useApp();
  const { t } = useI18n();
  const inCall = members.filter((m) => inCallUserIds?.has(m.id));
  const notInCall = members.filter((m) => !inCallUserIds?.has(m.id));

  function Row({ m }: { m: Profile }) {
    const inVoice = inCallUserIds?.has(m.id);
    return (
      <button
        type="button"
        onClick={() => onMemberClick?.(m)}
        onContextMenu={(e) => {
          e.preventDefault();
          onMemberContext?.(m, e.clientX, e.clientY);
        }}
        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-interactive-hover"
      >
        <div className="relative">
          <Avatar profile={m} size="sm" />
          <StatusDot status={presenceStatusFor(m, presenceMap)} size={10} ring="var(--bg-secondary)" />
        </div>
        <span className="truncate text-sm text-text-normal">
          {displayName(m)}
          {m.id === ownerId && (
            <span title={t("Group owner")} className="ml-1 inline-flex align-[-2px] text-[#f0b232]">
              <IconCrown size={13} />
            </span>
          )}
          {m.id === currentUserId && <span className="ml-1 text-[11px] text-text-muted">{t("(you)")}</span>}
        </span>
        {inVoice && <span className="ml-auto text-[10px] font-semibold text-status-online">{t("In call")}</span>}
      </button>
    );
  }

  return (

    <aside className="flex w-60 shrink-0 flex-col overflow-y-auto bg-bg-secondary">
      <div className="p-4">
        {onInvite && members.length < 10 && (
          <button
            type="button"
            onClick={onInvite}
            className="mb-4 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-text-normal transition-colors hover:bg-interactive-hover"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-white">
              <IconUserPlus size={16} />
            </span>
            {t("Add friends")}
          </button>
        )}
        {inCall.length > 0 && (
          <section className="mb-4">
            <p className="mb-1 px-2 text-xs font-bold uppercase text-status-online">
              {t("In Voice —")}{" "}{inCall.length}
            </p>
            {inCall.map((m) => <Row key={m.id} m={m} />)}
          </section>
        )}
        <section>
          <p className="mb-1 px-2 text-xs font-bold uppercase text-text-muted">
            {t("Members —")}{" "}{members.length}/10
          </p>
          {notInCall.map((m) => <Row key={m.id} m={m} />)}
        </section>
      </div>
    </aside>
  );
}

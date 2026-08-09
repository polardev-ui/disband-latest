"use client";

import { Avatar } from "@/components/ui/Avatar";
import { PlatformBadge } from "@/components/ui/PlatformBadge";
import { displayName } from "@/lib/utils";
import { useApp } from "@/contexts/AppContext";
import { IconCrown, IconShield } from "@/components/icons";
import { Tooltip } from "./Tooltip";
import type { Profile, ServerMember, ServerRole, UserStatus } from "@/lib/supabase/types";

interface MemberListProps {
  members: (ServerMember & { profile: Profile })[];
  roles: ServerRole[];
  onMemberClick?: (member: ServerMember & { profile: Profile }) => void;
  onMemberContext?: (member: ServerMember & { profile: Profile }, x: number, y: number) => void;
}

const STATUS_BG: Record<UserStatus, string> = {
  online: "bg-status-online",
  idle: "bg-status-idle",
  dnd: "bg-status-dnd",
  offline: "bg-status-offline",
};

function memberRoleIds(member: ServerMember): string[] {
  if (member.role_ids && member.role_ids.length > 0) return member.role_ids;
  return member.role_id ? [member.role_id] : [];
}

/** Like Discord, the highest-priority role wins for grouping and colouring. */
function topRole(member: ServerMember, roles: ServerRole[]): ServerRole | null {
  let best: ServerRole | null = null;
  for (const id of memberRoleIds(member)) {
    const r = roles.find((x) => x.id === id);
    if (r && (!best || r.position > best.position)) best = r;
  }
  return best;
}

function roleLabel(member: ServerMember, roles: ServerRole[]): string {
  if (member.role === "owner") return "Owner";
  return topRole(member, roles)?.name ?? member.role;
}

function roleColor(member: ServerMember, roles: ServerRole[]): string | null {
  return topRole(member, roles)?.color ?? null;
}

export function MemberList({ members, roles, onMemberClick, onMemberContext }: MemberListProps) {
  const { presenceMap } = useApp();
  const liveStatus = (p: Profile): UserStatus => presenceMap.get(p.id) ?? "offline";
  const online = members.filter((m) => liveStatus(m.profile) !== "offline");
  const offline = members.filter((m) => liveStatus(m.profile) === "offline");

  const grouped = online.reduce<Record<string, (ServerMember & { profile: Profile })[]>>((acc, m) => {
    const key = roleLabel(m, roles);
    (acc[key] ??= []).push(m);
    return acc;
  }, {});

  function Row({ m }: { m: ServerMember & { profile: Profile } }) {
    const p = m.profile;
    const color = roleColor(m, roles);
    const live = liveStatus(p);
    return (
      <button
        type="button"
        onClick={() => onMemberClick?.(m)}
        onContextMenu={(e) => {
          e.preventDefault();
          onMemberContext?.(m, e.clientX, e.clientY);
        }}
        className="group flex w-full items-center gap-3 rounded px-2 py-1.5 transition-all duration-150 ease-in-out hover:bg-interactive-hover"
      >
        <div className="relative shrink-0">
          <Avatar profile={p} size="sm" />
          {live !== "offline" && (
            <span className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[3px] border-bg-secondary ${STATUS_BG[live]}`} />
          )}
        </div>
        <span
          className={`flex min-w-0 flex-1 items-center gap-1.5 truncate text-[15px] ${live === "offline" ? "text-text-muted" : "text-text-normal"}`}
          style={color ? { color } : undefined}
        >
          <span className="truncate">{displayName(p)}</span>
          <PlatformBadge profile={p} />
          {m.role === "owner" && (
            <Tooltip label="Owner" side="top" as="span">
              <IconShield size={14} className="shrink-0 text-status-online" />
            </Tooltip>
          )}
          {m.role === "admin" && (
            <Tooltip label="Admin" side="top" as="span">
              <IconCrown size={14} className="shrink-0 text-[#f0b232]" />
            </Tooltip>
          )}
        </span>
      </button>
    );
  }

  return (
    <aside className="hidden w-60 shrink-0 flex-col overflow-y-auto bg-bg-secondary lg:flex">
      <div className="p-4">
        {Object.entries(grouped).map(([label, list]) => (
          <section key={label} className="mb-4">
            <h2 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
              {label} — {list.length}
            </h2>
            {list.map((m) => (
              <Row key={m.user_id} m={m} />
            ))}
          </section>
        ))}
        {offline.length > 0 && (
          <section>
            <h2 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
              Offline — {offline.length}
            </h2>
            {offline.map((m) => (
              <Row key={m.user_id} m={m} />
            ))}
          </section>
        )}
      </div>
    </aside>
  );
}

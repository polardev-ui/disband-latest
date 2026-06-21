"use client";

import { displayName } from "@/lib/utils";
import type { Profile, ServerMember } from "@/lib/supabase/types";

interface MemberListProps {
  members: (ServerMember & { profile: Profile })[];
  onMemberContext?: (member: ServerMember & { profile: Profile }, x: number, y: number) => void;
}

const STATUS_BG = {
  online: "bg-status-online",
  idle: "bg-status-idle",
  dnd: "bg-status-dnd",
  offline: "bg-status-offline",
} as const;

export function MemberList({ members, onMemberContext }: MemberListProps) {
  const online = members.filter((m) => m.profile.status !== "offline");
  const offline = members.filter((m) => m.profile.status === "offline");

  const byRole = online.reduce<Record<string, (ServerMember & { profile: Profile })[]>>((acc, m) => {
    (acc[m.role] ??= []).push(m);
    return acc;
  }, {});

  function Row({ m }: { m: ServerMember & { profile: Profile } }) {
    const p = m.profile;
    return (
      <button
        type="button"
        onContextMenu={(e) => {
          e.preventDefault();
          onMemberContext?.(m, e.clientX, e.clientY);
        }}
        className="group flex w-full items-center gap-3 rounded px-2 py-1.5 transition-all duration-150 ease-in-out hover:bg-interactive-hover"
      >
        <div className="relative shrink-0">
          <div
            className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full text-xs font-semibold text-white"
            style={{ backgroundColor: p.accent_color ?? "#5865f2" }}
          >
            {p.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              displayName(p).charAt(0).toUpperCase()
            )}
          </div>
          {p.status !== "offline" && (
            <span className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[3px] border-bg-secondary ${STATUS_BG[p.status]}`} />
          )}
        </div>
        <span className={`truncate text-[15px] ${p.status === "offline" ? "text-text-muted" : "text-text-normal"}`}>
          {displayName(p)}
        </span>
      </button>
    );
  }

  return (
    <aside className="hidden w-60 shrink-0 flex-col overflow-y-auto bg-bg-secondary lg:flex">
      <div className="p-4">
        {Object.entries(byRole).map(([role, list]) => (
          <section key={role} className="mb-4">
            <h2 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
              {role} — {list.length}
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

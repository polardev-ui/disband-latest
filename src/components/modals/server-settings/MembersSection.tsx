"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Avatar } from "@/components/ui/Avatar";
import { RolePicker } from "@/components/ui/RolePicker";
import { RoleIcon } from "@/components/ui/RoleIcon";
import { IconCrown, IconFriends, IconLeave, IconLock } from "@/components/icons";
import { displayName } from "@/lib/utils";
import { memberIconRole } from "@/lib/role-icons";
import type { ServerRole } from "@/lib/supabase/types";
import { ConfirmDialog, EmptyState, InlineError, SearchField, enterStyle, iconBtnDanger } from "./ui";
import type { SectionProps } from "./types";

type Pending = { kind: "kick" | "ban"; userId: string; name: string } | null;

export function MembersSection({ isOwner }: SectionProps) {
  const { members, serverRoles, serverPermissions, setMemberRoles, kickMember, banMember, loadAllMembers, user } = useApp();
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);

  // The member rail loads one page at a time; moderating the whole space
  // (search, role assignment, kicks) needs every page.
  useEffect(() => {
    void loadAllMembers();
  }, [loadAllMembers]);

  const canKick = isOwner || serverPermissions.kick;
  const canBan = isOwner || serverPermissions.ban;
  const assignable = useMemo(() => serverRoles.filter((r) => !r.is_default), [serverRoles]);
  const roleById = useMemo(() => new Map(serverRoles.map((r) => [r.id, r])), [serverRoles]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? members.filter((m) => `${m.profile ? displayName(m.profile) : ""} ${m.profile?.username ?? ""}`.toLowerCase().includes(q))
      : members;
    // Owner first, then by highest role, then alphabetically.
    const top = (ids: string[]) => Math.max(0, ...ids.map((id) => roleById.get(id)?.position ?? 0));
    return [...list].sort((a, b) => {
      if (a.role === "owner") return -1;
      if (b.role === "owner") return 1;
      const diff = top(roleIdsOf(b)) - top(roleIdsOf(a));
      if (diff !== 0) return diff;
      return (a.profile ? displayName(a.profile) : "").localeCompare(b.profile ? displayName(b.profile) : "");
    });
  }, [members, query, roleById]);

  async function toggleRole(userId: string, roleId: string) {
    const member = members.find((m) => m.user_id === userId);
    if (!member) return;
    const current = roleIdsOf(member);
    const next = current.includes(roleId) ? current.filter((id) => id !== roleId) : [...current, roleId];
    setBusyId(userId);
    setError(null);
    const err = await setMemberRoles(userId, next);
    setBusyId(null);
    if (err) setError(err);
  }

  return (
    <div className="pb-10">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex-1">
          <SearchField value={query} onChange={setQuery} placeholder="Search members" label="Search members" />
        </div>
        <span className="shrink-0 text-[13px] tabular-nums text-text-muted">
          {members.length} {members.length === 1 ? "member" : "members"}
        </span>
      </div>

      <InlineError>{error}</InlineError>

      <div className="mt-3 overflow-hidden rounded-lg bg-bg-secondary">
        {shown.length === 0 ? (
          <EmptyState icon={<IconFriends size={20} />} title={query ? "Nobody matches that" : "No members yet"} />
        ) : (
          <ul>
            {shown.map((m, i) => {
              const ids = roleIdsOf(m);
              const roles = ids.map((id) => roleById.get(id)).filter((r): r is ServerRole => !!r && !r.is_default);
              const top = [...roles].sort((a, b) => b.position - a.position)[0];
              const iconRole = memberIconRole(m, serverRoles);
              const name = m.profile ? displayName(m.profile) : "Unknown member";
              const isSelf = m.user_id === user?.id;
              const isOwnerRow = m.role === "owner";
              return (
                <li
                  key={m.user_id}
                  className="view-enter flex items-center gap-3 border-b border-divider px-4 py-3 last:border-b-0"
                  style={enterStyle(i)}
                >
                  <Avatar profile={m.profile} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-[14px] font-medium" style={top?.color ? { color: top.color } : undefined}>
                      <span className="truncate">{name}</span>
                      {iconRole && <RoleIcon icon={iconRole.icon} name={iconRole.name} size={15} />}
                      {isOwnerRow && <IconCrown size={13} className="shrink-0 text-[#f0b232]" aria-label="Owner" />}
                      {isSelf && <span className="shrink-0 text-[11px] font-normal text-text-muted">you</span>}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {roles.length === 0 ? (
                        <span className="text-[12px] text-text-muted">{m.profile?.username ? `@${m.profile.username}` : "No roles"}</span>
                      ) : (
                        roles
                          .sort((a, b) => b.position - a.position)
                          .map((r) => (
                            <span
                              key={r.id}
                              className="inline-flex h-[22px] items-center gap-1.5 rounded-[6px] border border-divider bg-bg-accent px-1.5 text-[11.5px] font-medium text-text-normal"
                            >
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: r.color }} />
                              {r.name}
                            </span>
                          ))
                      )}
                    </div>
                  </div>
                  {!isSelf && !isOwnerRow && (
                    <div className="flex shrink-0 items-center gap-1">
                      <RolePicker
                        roles={assignable}
                        selected={ids}
                        onToggle={(roleId) => void toggleRole(m.user_id, roleId)}
                        disabled={busyId === m.user_id}
                        align="right"
                        compact
                      />
                      {canKick && (
                        <button
                          type="button"
                          onClick={() => setPending({ kind: "kick", userId: m.user_id, name })}
                          className={iconBtnDanger}
                          aria-label={`Kick ${name}`}
                          title="Kick"
                        >
                          <IconLeave size={16} />
                        </button>
                      )}
                      {canBan && (
                        <button
                          type="button"
                          onClick={() => setPending({ kind: "ban", userId: m.user_id, name })}
                          className={iconBtnDanger}
                          aria-label={`Ban ${name}`}
                          title="Ban"
                        >
                          <IconLock size={15} />
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={!!pending}
        title={pending ? `${pending.kind === "kick" ? "Kick" : "Ban"} ${pending.name}?` : ""}
        body={
          pending?.kind === "kick"
            ? "They're removed from the space but can come back with a new invite."
            : "They're removed and can't rejoin until you lift the ban in Bans."
        }
        input={pending?.kind === "ban" ? { label: "Reason (optional)", placeholder: "Only moderators see this" } : undefined}
        confirmLabel={pending?.kind === "kick" ? "Kick" : "Ban"}
        onCancel={() => setPending(null)}
        onConfirm={async (reason) => {
          if (!pending) return;
          setError(null);
          const err = pending.kind === "kick" ? await kickMember(pending.userId) : await banMember(pending.userId, reason || undefined);
          if (err) setError(err);
          setPending(null);
        }}
      />
    </div>
  );
}

function roleIdsOf(m: { role_ids?: string[] | null; role_id?: string | null }): string[] {
  if (m.role_ids && m.role_ids.length > 0) return m.role_ids;
  return m.role_id ? [m.role_id] : [];
}

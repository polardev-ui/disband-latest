"use client";

import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { catalystLevel } from "@/lib/catalysts";
import type { ServerPermissionKey, ServerRole } from "@/lib/supabase/types";
import { IconEdit, IconGripVertical, IconPlus, IconTrash } from "@/components/icons";

export const PERM_GROUPS: { title: string; perms: { key: ServerPermissionKey; label: string; hint: string }[] }[] = [
  {
    title: "Moderation",
    perms: [
      { key: "kick", label: "Kick Members", hint: "Remove members from the server" },
      { key: "ban", label: "Ban Members", hint: "Ban members and manage the ban list" },
      { key: "timeout_members", label: "Timeout Members", hint: "Temporarily mute members in chat" },
      { key: "manage_messages", label: "Manage Messages", hint: "Delete anyone's messages" },
      { key: "pin_messages", label: "Pin Messages", hint: "Pin messages to channels" },
      { key: "mention_everyone", label: "Mention @everyone", hint: "Use @everyone and @here" },
    ],
  },
  {
    title: "Messages",
    perms: [
      { key: "send_messages", label: "Send Messages", hint: "Post in text channels" },
      { key: "add_reactions", label: "Add Reactions", hint: "React to messages" },
      { key: "attach_files", label: "Attach Files", hint: "Upload files and images" },
    ],
  },
  {
    title: "Management",
    perms: [
      { key: "manage_roles", label: "Manage Roles", hint: "Create roles and assign them" },
      { key: "manage_channels", label: "Manage Channels", hint: "Create, edit and delete channels" },
      { key: "manage_server", label: "Manage Server", hint: "Edit server settings and invites" },
      { key: "create_invites", label: "Create Invites", hint: "Share invite links" },
      { key: "manage_emojis", label: "Manage Emoji", hint: "Add and remove custom emoji" },
      { key: "view_audit_log", label: "View Audit Log", hint: "See who did what" },
    ],
  },
];

export const ROLE_COLORS = ["#5865f2", "#57f287", "#fee75c", "#eb459e", "#ed4245", "#e67e22", "#9b59b6", "#1abc9c", "#95a5ba", "#ffffff"];

function Toggle({ on, disabled, onFlip, label }: { on: boolean; disabled?: boolean; onFlip: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onFlip}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
        on ? "bg-brand" : "bg-bg-accent"
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`}
      />
    </button>
  );
}

export function RoleManager() {
  const {
    serverRoles,
    members,
    createRole,
    updateRole,
    deleteRole,
    moveRole,
    catalystCounts,
    activeServer,
  } = useApp();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string | null>(null);

  const sorted = [...serverRoles].sort((a, b) => b.position - a.position);
  const lvl = catalystLevel(activeServer ? (catalystCounts[activeServer.id] ?? 0) : 0);
  const selected: ServerRole | undefined =
    sorted.find((r) => r.id === selectedId) ?? sorted.find((r) => !r.is_default) ?? sorted[0];
  const perms = selected?.permissions ?? {};
  const memberCount = (roleId: string, isDefault: boolean) =>
    isDefault
      ? members.length
      : members.filter((m) => m.role_ids?.includes(roleId) ?? m.role_id === roleId).length;

  const run = async (fn: () => Promise<string | null>) => {
    setLoading(true);
    setError(null);
    const err = await fn();
    if (err) setError(err);
    setLoading(false);
  };

  const saveName = (role: ServerRole) => {
    const next = (editName ?? "").trim();
    setEditName(null);
    if (!next || next === role.name) return;
    void run(() => updateRole(role.id, { name: next }));
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-text-normal">Roles</h2>
        <p className="mt-1 text-sm text-text-muted">
          Select a role to edit it. Drag rows to reorder — higher roles win when permissions conflict.
        </p>
      </div>
      {error && <p className="rounded-md bg-status-dnd/10 px-3 py-2 text-[13px] text-status-dnd">{error}</p>}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[200px_1fr]">
        <div className="space-y-3">
          <ul className="space-y-1.5">
            {sorted.map((r) => {
              const isSel = selected?.id === r.id;
              return (
                <li
                  key={r.id}
                  draggable={!r.is_default}
                  onDragStart={(e) => {
                    if (r.is_default) return;
                    setDragId(r.id);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", r.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverId(null);
                  }}
                  onDragOver={(e) => {
                    if (r.is_default) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setOverId(r.id);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragId && dragId !== r.id) void run(() => moveRole(dragId, r.position));
                    setDragId(null);
                    setOverId(null);
                  }}
                  className={`rounded-lg border transition-all ${
                    isSel ? "border-brand bg-brand/10" : "border-divider bg-bg-secondary hover:border-text-muted"
                  } ${overId === r.id && dragId && dragId !== r.id ? "ring-2 ring-brand" : ""} ${
                    dragId === r.id ? "opacity-40" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(r.id)}
                    className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
                  >
                    {!r.is_default && (
                      <span className="cursor-grab text-text-muted active:cursor-grabbing" title="Drag to reorder">
                        <IconGripVertical size={14} />
                      </span>
                    )}
                    <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-normal">
                      {r.name}
                      {r.is_default && <span className="ml-1.5 text-[11px] text-text-muted">Default</span>}
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-text-muted">
                      {memberCount(r.id, r.is_default)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex gap-1.5">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim()) void run(() => createRole({ name: newName.trim(), color: "#99aab5" }).then(() => {
                  setNewName("");
                  return null;
                }));
              }}
              placeholder="New role"
              maxLength={32}
              className="min-w-0 flex-1 rounded-md border border-divider bg-bg-secondary px-2.5 py-1.5 text-sm text-text-normal outline-none placeholder:text-text-muted focus:border-brand"
            />
            <button
              type="button"
              disabled={loading || !newName.trim()}
              onClick={() =>
                void run(() => createRole({ name: newName.trim(), color: "#99aab5" }).then(() => {
                  setNewName("");
                  return null;
                }))
              }
              aria-label="Create role"
              className="shrink-0 rounded-md bg-brand px-2.5 py-1.5 text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <IconPlus size={16} />
            </button>
          </div>
        </div>

        <div className="min-w-0 rounded-lg border border-divider bg-bg-secondary p-4">
          {!selected ? (
            <p className="text-sm text-text-muted">No roles yet — create one.</p>
          ) : (
            <div className="space-y-5" key={selected.id}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="h-6 w-6 shrink-0 rounded-full" style={{ backgroundColor: selected.color }} />
                {editName !== null ? (
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => saveName(selected)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveName(selected);
                      if (e.key === "Escape") setEditName(null);
                    }}
                    maxLength={32}
                    className="min-w-0 flex-1 rounded-md border border-brand bg-bg-tertiary px-2 py-1 text-[15px] font-bold text-text-normal outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditName(selected.name)}
                    title="Rename role"
                    className="group flex min-w-0 items-center gap-1.5 text-[15px] font-bold text-text-normal"
                  >
                    <span className="truncate">{selected.name}</span>
                    <IconEdit size={14} className="shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                )}
                <span className="text-xs tabular-nums text-text-muted">
                  {memberCount(selected.id, selected.is_default)} members
                </span>
                {!selected.is_default && (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      if (confirm(`Delete role "${selected.name}"? Members keep everything else.`)) {
                        void run(() => deleteRole(selected.id)).then(() => setSelectedId(null));
                      }
                    }}
                    className="ml-auto rounded p-1.5 text-text-muted transition-colors hover:bg-status-dnd/15 hover:text-status-dnd disabled:opacity-40"
                    aria-label={`Delete ${selected.name}`}
                  >
                    <IconTrash size={15} />
                  </button>
                )}
              </div>

              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-text-muted">Color</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {ROLE_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Use color ${c}`}
                      disabled={loading}
                      onClick={() => void run(() => updateRole(selected.id, { color: c }))}
                      style={{ backgroundColor: c }}
                      className={`h-6 w-6 rounded-full transition-transform hover:scale-110 disabled:opacity-40 ${
                        selected.color.toLowerCase() === c ? "ring-2 ring-white ring-offset-2 ring-offset-bg-secondary" : ""
                      }`}
                    />
                  ))}
                  <input
                    type="color"
                    value={selected.color}
                    disabled={loading}
                    onChange={(e) => void run(() => updateRole(selected.id, { color: e.target.value }))}
                    title="Custom color"
                    className="h-6 w-8 cursor-pointer rounded disabled:opacity-40"
                  />
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-text-muted">
                  Gradient {lvl.level < 3 && <span className="font-normal normal-case">· Level 3 unlocks</span>}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="color"
                    value={selected.gradient_to ?? selected.color}
                    disabled={loading || lvl.level < 3}
                    title={lvl.level >= 3 ? "Gradient end color" : "Boost to Level 3 for gradients"}
                    onChange={(e) => void run(() => updateRole(selected.id, { gradient_to: e.target.value }))}
                    className="h-7 w-10 cursor-pointer rounded disabled:cursor-not-allowed disabled:opacity-40"
                  />
                  {selected.gradient_to && (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void run(() => updateRole(selected.id, { gradient_to: null, gradient_animated: false }))}
                      className="text-xs text-text-muted hover:text-text-normal disabled:opacity-40"
                    >
                      Clear
                    </button>
                  )}
                  <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-text-muted">
                    <input
                      type="checkbox"
                      checked={!!selected.gradient_animated}
                      disabled={loading || !selected.gradient_to || lvl.level < 3}
                      onChange={(e) => void run(() => updateRole(selected.id, { gradient_animated: e.target.checked }))}
                      className="h-3.5 w-3.5 accent-brand disabled:opacity-40"
                    />
                    Animated
                  </label>
                </div>
              </div>

              {PERM_GROUPS.map((group) => (
                <div key={group.title}>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-text-muted">{group.title}</p>
                  <div className="space-y-1">
                    {group.perms.map((p) => {
                      const locked = selected.is_default && p.key !== "send_messages" && p.key !== "add_reactions" && p.key !== "attach_files";
                      return (
                        <div
                          key={p.key}
                          className={`flex items-center gap-3 rounded-md px-2.5 py-2 ${locked ? "opacity-40" : "hover:bg-bg-tertiary"}`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium leading-tight text-text-normal">{p.label}</p>
                            <p className="truncate text-xs text-text-muted">{p.hint}</p>
                          </div>
                          <Toggle
                            on={!!selected.permissions?.[p.key]}
                            disabled={loading || locked}
                            onFlip={() =>
                              void run(() =>
                                updateRole(selected.id, {
                                  permissions: { ...selected.permissions, [p.key]: !selected.permissions?.[p.key] },
                                }),
                              )
                            }
                            label={p.label}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {selected.is_default && (
                <p className="text-xs leading-relaxed text-text-muted">
                  The default role holds no moderation powers. Its message permissions act as channel defaults for everyone.
                </p>
              )}

              <div className="flex items-center gap-2">
                {!selected.is_default && (
                  <>
                    <button
                      type="button"
                      disabled={loading || selected.position >= serverRoles.length - 1}
                      onClick={() => void run(() => moveRole(selected.id, selected.position + 1))}
                      className="rounded-md border border-divider px-2.5 py-1.5 text-xs font-medium text-text-muted transition-colors hover:text-text-normal disabled:opacity-40"
                    >
                      Move up
                    </button>
                    <button
                      type="button"
                      disabled={loading || selected.position <= 1}
                      onClick={() => void run(() => moveRole(selected.id, selected.position - 1))}
                      className="rounded-md border border-divider px-2.5 py-1.5 text-xs font-medium text-text-muted transition-colors hover:text-text-normal disabled:opacity-40"
                    >
                      Move down
                    </button>
                  </>
                )}
                <span className="ml-auto text-xs tabular-nums text-text-muted">Position {selected.position}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

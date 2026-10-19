"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useMediaUpload } from "@/hooks/useMediaUpload";
import { catalystLevel } from "@/lib/catalysts";
import { roleGradientTextStyle, roleIsGradientAnimated } from "@/lib/profileColor";
import { cleanRoleIconEmoji, isEmojiRoleIcon, isImageRoleIcon } from "@/lib/role-icons";
import type { ServerPermissionKey, ServerRole } from "@/lib/supabase/types";
import { RoleIcon } from "@/components/ui/RoleIcon";
import { IconChevron, IconGripVertical, IconPlus, IconShield, IconTrash, IconUpload } from "@/components/icons";
import {
  ConfirmDialog,
  EmptyState,
  FieldLabel,
  FilePickButton,
  InlineError,
  LevelLock,
  Segmented,
  SettingRow,
  SettingsSection,
  Toggle,
  btn,
  enterStyle,
  iconBtn,
  iconBtnDanger,
} from "@/components/modals/server-settings/ui";

export const PERM_GROUPS: { title: string; perms: { key: ServerPermissionKey; label: string; hint: string }[] }[] = [
  {
    title: "Moderation",
    perms: [
      { key: "kick", label: "Kick members", hint: "Remove people from the space. They can come back with an invite." },
      { key: "ban", label: "Ban members", hint: "Remove people for good and manage the ban list." },
      { key: "timeout_members", label: "Time out members", hint: "Stop someone posting for a while." },
      { key: "manage_messages", label: "Manage messages", hint: "Delete anyone's messages." },
      { key: "pin_messages", label: "Pin messages", hint: "Pin messages to a channel." },
      { key: "mention_everyone", label: "Mention @everyone", hint: "Ping the whole space with @everyone and @here." },
    ],
  },
  {
    title: "Messages",
    perms: [
      { key: "send_messages", label: "Send messages", hint: "Post in text channels." },
      { key: "add_reactions", label: "Add reactions", hint: "React to messages." },
      { key: "attach_files", label: "Attach files", hint: "Upload images and files." },
    ],
  },
  {
    title: "Management",
    perms: [
      { key: "manage_roles", label: "Manage roles", hint: "Create roles below their own and assign them." },
      { key: "manage_channels", label: "Manage channels", hint: "Create, edit and delete channels." },
      { key: "manage_server", label: "Manage space", hint: "Edit the space's settings and invites." },
      { key: "create_invites", label: "Create invites", hint: "Share invite links." },
      { key: "manage_emojis", label: "Manage emoji", hint: "Add and remove custom emoji and sounds." },
      { key: "manage_webhooks", label: "Manage webhooks", hint: "Create, edit and delete webhooks." },
      { key: "view_audit_log", label: "View audit log", hint: "See who did what." },
    ],
  },
];

export const ROLE_COLORS = ["#5865f2", "#57f287", "#fee75c", "#eb459e", "#ed4245", "#e67e22", "#9b59b6", "#1abc9c", "#95a5ba", "#ffffff"];

const DEFAULT_ROLE_PERMS: ServerPermissionKey[] = ["send_messages", "add_reactions", "attach_files"];
const ICON_TYPES = "image/png,image/webp,image/gif,image/jpeg";

type Tab = "display" | "permissions";

export function RoleManager({ onBoost }: { onBoost?: () => void } = {}) {
  const { serverRoles, members, createRole, updateRole, deleteRole, moveRole, catalystCounts, activeServer, loadAllMembers } = useApp();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("display");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ServerRole | null>(null);
  const knownIds = useRef<Set<string>>(new Set(serverRoles.map((r) => r.id)));
  const awaitingNew = useRef(false);

  const catalystCount = activeServer ? (catalystCounts[activeServer.id] ?? 0) : 0;
  const level = catalystLevel(catalystCount).level;
  const sorted = [...serverRoles].sort((a, b) => b.position - a.position);
  const selected: ServerRole | undefined =
    sorted.find((r) => r.id === selectedId) ?? sorted.find((r) => !r.is_default) ?? sorted[0];

  // Select a role the moment it appears after "Create role".
  useEffect(() => {
    const fresh = serverRoles.find((r) => !knownIds.current.has(r.id));
    if (fresh && awaitingNew.current) {
      awaitingNew.current = false;
      setSelectedId(fresh.id);
      setTab("display");
    }
    knownIds.current = new Set(serverRoles.map((r) => r.id));
  }, [serverRoles]);

  // Per-role member counts span the whole roster, which the member rail loads
  // one page at a time; page in the rest while this panel is open.
  useEffect(() => {
    void loadAllMembers();
  }, [loadAllMembers]);

  const memberCount = (role: ServerRole) =>
    role.is_default ? members.length : members.filter((m) => (m.role_ids?.length ? m.role_ids.includes(role.id) : m.role_id === role.id)).length;

  const run = async (fn: () => Promise<string | null>) => {
    setError(null);
    const err = await fn();
    if (err) setError(err);
    return err;
  };

  async function create() {
    setCreating(true);
    awaitingNew.current = true;
    const err = await run(() => createRole({ name: "new role", color: "#99aab5" }));
    if (err) awaitingNew.current = false;
    setCreating(false);
  }

  return (
    <div className="pb-10">
      <InlineError>{error}</InlineError>
      <div className={`grid grid-cols-1 gap-5 md:grid-cols-[236px_minmax(0,1fr)] ${error ? "mt-3" : ""}`}>
        {/* Role list */}
        <div className="min-w-0">
          <button type="button" onClick={() => void create()} disabled={creating} className={`${btn.secondary} mb-3 w-full`}>
            <IconPlus size={15} /> {creating ? "Creating…" : "Create role"}
          </button>
          <ul className="overflow-hidden rounded-lg bg-bg-secondary p-1.5">
            {sorted.map((r, i) => {
              const active = selected?.id === r.id;
              const dropTarget = overId === r.id && dragId && dragId !== r.id;
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
                    if (r.is_default || !dragId) return;
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
                  className={`view-enter relative ${dragId === r.id ? "opacity-40" : ""}`}
                  style={enterStyle(i)}
                >
                  {dropTarget && <span aria-hidden className="absolute inset-x-2 -top-px h-0.5 rounded-full bg-brand" />}
                  <button
                    type="button"
                    onClick={() => setSelectedId(r.id)}
                    aria-current={active ? "true" : undefined}
                    className={`group flex h-9 w-full items-center gap-2 rounded-[4px] px-2 text-left transition-colors duration-150 ${
                      active ? "bg-interactive-selected" : "hover:bg-interactive-hover"
                    }`}
                  >
                    <span
                      className={`w-3.5 shrink-0 text-text-muted ${r.is_default ? "invisible" : "cursor-grab opacity-0 group-hover:opacity-100 active:cursor-grabbing"}`}
                      title="Drag to reorder"
                    >
                      <IconGripVertical size={14} />
                    </span>
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                    <span className={`min-w-0 flex-1 truncate text-[14px] ${active ? "font-medium text-text-normal" : "text-text-normal/90"}`}>
                      {r.is_default ? "@everyone" : r.name}
                    </span>
                    {r.icon && <RoleIcon icon={r.icon} name={r.name} size={14} />}
                    <span className="shrink-0 text-[11.5px] tabular-nums text-text-muted">{memberCount(r)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-2.5 px-1 text-[12px] leading-relaxed text-text-muted">
            Drag to reorder. Higher roles win when permissions disagree, and set a member&apos;s name colour.
          </p>
        </div>

        {/* Editor */}
        <div className="min-w-0">
          {!selected ? (
            <div className="rounded-lg bg-bg-secondary">
              <EmptyState icon={<IconShield size={20} />} title="No roles yet" body="Create one to start grouping members." />
            </div>
          ) : (
            <div key={selected.id} className="view-enter">
              <RoleHeader
                role={selected}
                count={memberCount(selected)}
                canMoveUp={!selected.is_default && selected.position < serverRoles.length - 1}
                canMoveDown={!selected.is_default && selected.position > 1}
                onMove={(dir) => void run(() => moveRole(selected.id, selected.position + dir))}
                onDelete={() => setDeleting(selected)}
              />
              <div className="mb-5">
                <Segmented
                  label="Role editor"
                  value={tab}
                  onChange={setTab}
                  options={[
                    { value: "display", label: "Display" },
                    { value: "permissions", label: "Permissions" },
                  ]}
                />
              </div>
              {tab === "display" ? (
                <DisplayTab role={selected} level={level} catalystCount={catalystCount} onBoost={onBoost} run={run} update={updateRole} />
              ) : (
                <PermissionsTab role={selected} run={run} update={updateRole} />
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!deleting}
        title={deleting ? `Delete ${deleting.name}?` : ""}
        body="Members with this role lose it, along with its colour and permissions. Nothing else about them changes."
        confirmLabel="Delete role"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          const err = await run(() => deleteRole(deleting.id));
          if (!err) setSelectedId(null);
          setDeleting(null);
        }}
      />
    </div>
  );
}

function RoleHeader({
  role,
  count,
  canMoveUp,
  canMoveDown,
  onMove,
  onDelete,
}: {
  role: ServerRole;
  count: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (dir: 1 | -1) => void;
  onDelete: () => void;
}) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: role.color }} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-[17px] font-semibold tracking-[-0.01em] text-text-normal">
          <span className="truncate">{role.is_default ? "@everyone" : role.name}</span>
          {role.icon && <RoleIcon icon={role.icon} name={role.name} size={17} />}
        </p>
        <p className="text-[12.5px] text-text-muted">
          {count} {count === 1 ? "member" : "members"}
          {role.is_default && " · everyone in the space has this role"}
        </p>
      </div>
      {!role.is_default && (
        <div className="flex items-center gap-0.5">
          <button type="button" onClick={() => onMove(1)} disabled={!canMoveUp} className={iconBtn} aria-label="Move role up" title="Move up">
            <IconChevron size={16} className="rotate-180" />
          </button>
          <button type="button" onClick={() => onMove(-1)} disabled={!canMoveDown} className={iconBtn} aria-label="Move role down" title="Move down">
            <IconChevron size={16} />
          </button>
          <button type="button" onClick={onDelete} className={iconBtnDanger} aria-label={`Delete ${role.name}`} title="Delete role">
            <IconTrash size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

type Update = ReturnType<typeof useApp>["updateRole"];
type Run = (fn: () => Promise<string | null>) => Promise<string | null>;

/** Commit a value only after the user stops changing it (colour pickers fire continuously). */
function useDebouncedCommit<T>(value: T, committed: T, commit: (v: T) => void, delay = 350) {
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(() => {
    if (value === committed) return;
    const t = window.setTimeout(() => commitRef.current(value), delay);
    return () => window.clearTimeout(t);
  }, [value, committed, delay]);
}

function DisplayTab({
  role,
  level,
  catalystCount,
  onBoost,
  run,
  update,
}: {
  role: ServerRole;
  level: number;
  catalystCount: number;
  onBoost?: () => void;
  run: Run;
  update: Update;
}) {
  const [name, setName] = useState(role.name);
  const [color, setColor] = useState(role.color);
  const [gradient, setGradient] = useState(role.gradient_to ?? role.color);

  useEffect(() => setName(role.name), [role.name]);
  useEffect(() => setColor(role.color), [role.color]);
  useEffect(() => setGradient(role.gradient_to ?? role.color), [role.gradient_to, role.color]);

  useDebouncedCommit(color, role.color, (v) => void run(() => update(role.id, { color: v })));
  // With no gradient set, "committed" equals the draft, so nothing is written.
  useDebouncedCommit(gradient, role.gradient_to ?? gradient, (v) => void run(() => update(role.id, { gradient_to: v })));

  const saveName = () => {
    const next = name.trim().slice(0, 32);
    if (!next) {
      setName(role.name);
      return;
    }
    if (next !== role.name) void run(() => update(role.id, { name: next }));
  };

  const previewRole = { ...role, color, gradient_to: role.gradient_to ? gradient : null };
  const gradStyle = roleGradientTextStyle(previewRole);

  return (
    <div>
      {/* How it looks where it matters: on a message. */}
      <SettingsSection title="Preview">
        <div className="flex items-start gap-3 px-5 py-4">
          <span className="h-10 w-10 shrink-0 rounded-full bg-bg-accent" />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[15px] font-medium leading-tight">
              <span
                className={gradStyle && roleIsGradientAnimated(previewRole) ? "animate-role-gradient" : ""}
                style={gradStyle ?? { color }}
              >
                {role.is_default ? "Someone" : `A ${role.name}`}
              </span>
              {role.icon && <RoleIcon icon={role.icon} name={role.name} size={16} />}
              <span className="text-[12px] font-normal text-text-muted">Today at 9:41 PM</span>
            </p>
            <p className="mt-1 text-[14px] text-text-normal/90">This is how my name looks in chat.</p>
          </div>
        </div>
      </SettingsSection>

      {!role.is_default && (
        <SettingsSection title="Name">
          <div className="px-5 py-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 32))}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setName(role.name);
                }
              }}
              aria-label="Role name"
              className="h-10 w-full rounded-[3px] border border-transparent bg-bg-tertiary px-3.5 text-[14px] text-text-normal outline-none focus:border-[#00a8fc]"
            />
          </div>
        </SettingsSection>
      )}

      <SettingsSection title="Colour" description="The highest coloured role sets a member's name colour.">
        <div className="flex flex-wrap items-center gap-2 px-5 py-4">
          {ROLE_COLORS.map((c) => {
            const active = color.toLowerCase() === c;
            return (
              <button
                key={c}
                type="button"
                aria-label={`Colour ${c}`}
                aria-pressed={active}
                onClick={() => setColor(c)}
                style={{ backgroundColor: c }}
                className={`h-8 w-8 rounded-full transition-transform duration-150 hover:scale-110 ${
                  active ? "ring-2 ring-text-normal ring-offset-2 ring-offset-bg-secondary" : ""
                }`}
              />
            );
          })}
          <label
            className="relative flex h-8 items-center gap-2 rounded-full border border-divider pl-1 pr-3 text-[12.5px] text-text-muted transition-colors hover:bg-interactive-hover"
            title="Custom colour"
          >
            <span className="h-6 w-6 rounded-full border border-divider" style={{ backgroundColor: color }} />
            <span className="font-mono">{color.toLowerCase()}</span>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Custom colour" />
          </label>
        </div>
      </SettingsSection>

      <RoleIconCard role={role} unlocked={level >= 2} catalystCount={catalystCount} onBoost={onBoost} run={run} update={update} />

      <SettingsSection title="Gradient" description="Fade the name into a second colour.">
        {level < 3 ? (
          <LevelLock level={3} count={catalystCount} perk="Gradient roles" onBoost={onBoost} />
        ) : (
          <>
            <SettingRow label="Use a gradient" htmlFor={`grad-${role.id}`} description="From the role colour into a second one.">
              <Toggle
                id={`grad-${role.id}`}
                label="Use a gradient"
                checked={!!role.gradient_to}
                onChange={(on) =>
                  void run(() => update(role.id, on ? { gradient_to: gradient === color ? "#eb459e" : gradient } : { gradient_to: null, gradient_animated: false }))
                }
              />
            </SettingRow>
            {role.gradient_to && (
              <>
                <SettingRow label="Second colour">
                  <label className="relative flex h-8 items-center gap-2 rounded-full border border-divider pl-1 pr-3 text-[12.5px] text-text-muted hover:bg-interactive-hover">
                    <span className="h-6 w-6 rounded-full border border-divider" style={{ backgroundColor: gradient }} />
                    <span className="font-mono">{gradient.toLowerCase()}</span>
                    <input type="color" value={gradient} onChange={(e) => setGradient(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Gradient end colour" />
                  </label>
                </SettingRow>
                <SettingRow label="Animate it" htmlFor={`grad-anim-${role.id}`} description="A slow shimmer across the name.">
                  <Toggle
                    id={`grad-anim-${role.id}`}
                    label="Animate the gradient"
                    checked={!!role.gradient_animated}
                    onChange={(on) => void run(() => update(role.id, { gradient_animated: on }))}
                  />
                </SettingRow>
              </>
            )}
          </>
        )}
      </SettingsSection>
    </div>
  );
}

function RoleIconCard({
  role,
  unlocked,
  catalystCount,
  onBoost,
  run,
  update,
}: {
  role: ServerRole;
  unlocked: boolean;
  catalystCount: number;
  onBoost?: () => void;
  run: Run;
  update: Update;
}) {
  const { upload } = useMediaUpload();
  const [emoji, setEmoji] = useState(role.icon && !isImageRoleIcon(role.icon) ? role.icon : "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setEmoji(role.icon && !isImageRoleIcon(role.icon) ? role.icon : ""), [role.icon]);

  async function setIcon(value: string | null) {
    setError(null);
    const err = await run(() => update(role.id, { icon: value }));
    if (err) setError(err);
  }

  function commitEmoji() {
    const clean = cleanRoleIconEmoji(emoji);
    if (!clean) return;
    if (!isEmojiRoleIcon(clean)) {
      setError("Use a single emoji, like 🛡️ or ⭐.");
      return;
    }
    if (clean !== role.icon) void setIcon(clean);
  }

  async function pickImage(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("That file isn't an image.");
      return;
    }
    if (file.size > 256 * 1024) {
      setError("Role icons can be up to 256 KB. They show at 16 px, so small is fine.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const res = await upload(file);
      if (!res) {
        setError("The upload didn't go through. Try again.");
        return;
      }
      await setIcon(res.url);
    } finally {
      setUploading(false);
    }
  }

  return (
    <SettingsSection title="Role icon" description="An emoji or a small picture shown after members' names in chat and the member list.">
      {!unlocked ? (
        <>
          <LevelLock level={2} count={catalystCount} perk="Role icons" onBoost={onBoost} />
          {role.icon && (
            <div className="flex items-center justify-between gap-3 border-t border-divider px-5 py-3">
              <span className="flex items-center gap-2 text-[13px] text-text-muted">
                Current icon <RoleIcon icon={role.icon} name={role.name} size={16} />
              </span>
              <button type="button" onClick={() => void setIcon(null)} className={btn.ghost}>
                Remove
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-4 px-5 py-4">
          <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] border border-divider bg-bg-accent ${uploading ? "animate-pulse" : ""}`}>
            {role.icon ? <RoleIcon icon={role.icon} name={role.name} size={30} /> : <IconShield size={20} className="text-text-muted" />}
          </div>
          <div className="min-w-0 flex-1 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-[120px]">
                <FieldLabel htmlFor={`role-emoji-${role.id}`}>Emoji</FieldLabel>
                <input
                  id={`role-emoji-${role.id}`}
                  value={emoji}
                  onChange={(e) => setEmoji(cleanRoleIconEmoji(e.target.value))}
                  onBlur={commitEmoji}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEmoji();
                  }}
                  placeholder="🛡️"
                  className="h-10 w-full rounded-[3px] border border-transparent bg-bg-tertiary px-3 text-center text-[20px] outline-none placeholder:opacity-40 focus:border-[#00a8fc]"
                />
              </div>
              <span className="mt-6 text-[12.5px] text-text-muted">or</span>
              <div className="mt-6 flex items-center gap-2">
                <FilePickButton accept={ICON_TYPES} disabled={uploading} onPick={(f) => void pickImage(f)}>
                  <IconUpload size={15} /> {uploading ? "Uploading…" : "Upload image"}
                </FilePickButton>
                {role.icon && (
                  <button type="button" onClick={() => void setIcon(null)} className={btn.ghost}>
                    Remove
                  </button>
                )}
              </div>
            </div>
            <p className="text-[12px] text-text-muted">Images: square PNG, WebP or GIF, 64 × 64 or bigger, up to 256 KB.</p>
          </div>
          {error && <p className="w-full text-[13px] text-status-dnd">{error}</p>}
        </div>
      )}
    </SettingsSection>
  );
}

function PermissionsTab({ role, run, update }: { role: ServerRole; run: Run; update: Update }) {
  return (
    <div>
      {role.is_default && (
        <p className="mb-5 rounded-[12px] border border-divider bg-bg-secondary px-4 py-3 text-[13px] leading-relaxed text-text-muted">
          @everyone can&apos;t hold moderation powers. Its message permissions are the default for every channel.
        </p>
      )}
      {PERM_GROUPS.map((group) => (
        <SettingsSection key={group.title} title={group.title}>
          {group.perms.map((p) => {
            const locked = role.is_default && !DEFAULT_ROLE_PERMS.includes(p.key);
            const on = !!role.permissions?.[p.key];
            return (
              <SettingRow key={p.key} label={p.label} description={locked ? "Not available on @everyone." : p.hint} htmlFor={`perm-${role.id}-${p.key}`}>
                <Toggle
                  id={`perm-${role.id}-${p.key}`}
                  label={p.label}
                  checked={on}
                  disabled={locked}
                  onChange={(next) => void run(() => update(role.id, { permissions: { ...role.permissions, [p.key]: next } }))}
                />
              </SettingRow>
            );
          })}
        </SettingsSection>
      ))}
    </div>
  );
}

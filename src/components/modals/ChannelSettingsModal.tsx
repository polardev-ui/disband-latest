"use client";

import { SettingsLayer, SettingsNavItem, SettingsNavSeparator } from "@/components/ui/SettingsLayer";
import { ConfirmDialog } from "@/components/modals/server-settings/ui";
import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
import { usePresence } from "@/hooks/usePresence";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { IconHash, IconMegaphone, IconSpeaker, IconTrash } from "@/components/icons";
import type { Channel } from "@/lib/supabase/types";

type ActionKey = "can_view" | "can_post" | "can_react" | "can_attach";
type TriState = null | boolean;

interface RolePermRow {
  role_id: string;
  role_name: string;
  role_color: string;
  is_default: boolean;
  can_view: boolean | null;
  can_post: boolean | null;
  can_react: boolean | null;
  can_attach: boolean | null;
}

type Draft = Record<string, Record<ActionKey, TriState>>;

const ACTIONS: { key: ActionKey; label: string }[] = [
  { key: "can_view", label: "View" },
  { key: "can_post", label: "Post" },
  { key: "can_react", label: "React" },
  { key: "can_attach", label: "Attach" },
];

function cycle(t: TriState): TriState {
  return t === null ? true : t === true ? false : null;
}

interface ChannelSettingsModalProps {
  channel: Channel | null;
  onClose: () => void;
}

export function ChannelSettingsModal({ channel: channelProp, onClose }: ChannelSettingsModalProps) {
  const app = useApp();
  const { mounted, exiting } = usePresence(channelProp !== null);
  const lastChannelRef = useRef<Channel | null>(null);
  if (channelProp) lastChannelRef.current = channelProp;
  const channel = channelProp ?? lastChannelRef.current;
  const [name, setName] = useState("");
  const [readOnly, setReadOnly] = useState(false);
  const [rows, setRows] = useState<RolePermRow[] | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [section, setSection] = useState<"overview" | "permissions" | "delete">("overview");

  const loadRows = useCallback(async (channelId: string) => {
    const supabase = getSupabaseClient();
    const { data } = await supabase.rpc("get_channel_permissions", { p_channel_id: channelId });
    const list = (data ?? []) as RolePermRow[];
    setRows(list);
    const d: Draft = {};
    for (const r of list) {
      d[r.role_id] = {
        can_view: r.can_view,
        can_post: r.can_post,
        can_react: r.can_react,
        can_attach: r.can_attach,
      };
    }
    setDraft(d);
  }, []);

  useEffect(() => {
    if (!channel) return;
    setName(channel.name);
    setReadOnly(!!channel.read_only);
    setRows(null);
    setDraft({});
    setSaved(false);
    setError(null);
    setSection("overview");
    void loadRows(channel.id);
  }, [channel, loadRows]);

  useOverlayDismiss(onClose, channel !== null);

  if (!mounted || !channel) return null;

  const rolePerms = (roleId: string) => {
    const perms = app.serverRoles.find((r) => r.id === roleId)?.permissions ?? {};
    return {
      can_view: true,
      can_post: perms.send_messages ?? false,
      can_react: perms.add_reactions ?? false,
      can_attach: perms.attach_files ?? false,
    } as Record<ActionKey, boolean>;
  };

  const setCell = (roleId: string, key: ActionKey, value: TriState) => {
    setDraft((prev) => ({
      ...prev,
      [roleId]: { ...(prev[roleId] ?? { can_view: null, can_post: null, can_react: null, can_attach: null }), [key]: value },
    }));
    setSaved(false);
  };

  // Shared by the desktop permission table and the mobile stacked cards so
  // the two layouts can't drift (same labels, tones, tooltips, cycling).
  const cellStateLabel = (value: boolean | null) =>
    value === null ? "Default" : value ? "Allow" : "Deny";
  const cellTitle = (value: boolean | null, fallback: boolean) =>
    value === null
      ? `Default (${fallback ? "allowed" : "denied"} by role settings)`
      : value
        ? "Override: allowed"
        : "Override: denied";
  const cellTone = (value: boolean | null) =>
    value === null
      ? "bg-bg-accent text-text-muted"
      : value
        ? "bg-status-online/15 text-status-online"
        : "bg-status-dnd/15 text-status-dnd";
  const renderCell = (roleId: string, a: { key: ActionKey; label: string }, extraClass = "") => {
    const value = draft[roleId]?.[a.key] ?? null;
    const fallback = rolePerms(roleId)[a.key];
    return (
      <button
        key={a.key}
        type="button"
        title={cellTitle(value, fallback)}
        aria-label={`${a.label}: ${cellStateLabel(value)}`}
        onClick={() => setCell(roleId, a.key, cycle(value))}
        className={`flex items-center justify-center rounded px-1.5 py-1 text-[11px] font-semibold transition-colors ${cellTone(value)} ${extraClass}`}
      >
        {cellStateLabel(value)}
      </button>
    );
  };

  // Anything differing from what was loaded raises the classic save bar.
  const dirty =
    name.trim() !== channel.name ||
    readOnly !== !!channel.read_only ||
    (rows ?? []).some((r) => ACTIONS.some((a) => (draft[r.role_id]?.[a.key] ?? null) !== r[a.key]));

  const save = async () => {
    if (!channel) return;
    setSaving(true);
    setError(null);
    const supabase = getSupabaseClient();
    try {
      const rename = name.trim();
      if (rename && rename !== channel.name) {
        const err = await app.renameChannel(channel.id, rename);
        if (err) throw new Error(err);
      }
      if (readOnly !== !!channel.read_only) {
        const err = await app.setChannelReadOnly(channel.id, readOnly);
        if (err) throw new Error(err);
      }
      for (const row of rows ?? []) {
        const cell = draft[row.role_id] ?? { can_view: null, can_post: null, can_react: null, can_attach: null };
        const { error: rpcErr } = await supabase.rpc("set_channel_role_permission", {
          p_channel_id: channel.id,
          p_role_id: row.role_id,
          p_can_view: cell.can_view,
          p_can_post: cell.can_post,
          p_can_react: cell.can_react,
          p_can_attach: cell.can_attach,
        });
        if (rpcErr) throw new Error(rpcErr.message);
      }
      setSaved(true);
      await loadRows(channel.id);
      void app.refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save channel settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsLayer
      label="Channel settings"
      exiting={exiting}
      onClose={onClose}
      contentKey={section}
      wide={section === "permissions"}
      mobileNav={
        <select
          value={section}
          onChange={(e) => setSection(e.target.value as typeof section)}
          aria-label="Channel settings section"
          className="w-full rounded-[4px] bg-bg-tertiary px-2 py-2 text-[16px] font-semibold text-text-normal outline-none"
        >
          <option value="overview">Overview</option>
          <option value="permissions">Permissions</option>
          <option value="delete">Delete Channel</option>
        </select>
      }
      sidebar={
        <>
          <div className="flex items-center gap-1 px-2.5 pb-1.5 text-channels-default">
            {channel.type === "text" ? (readOnly ? <IconMegaphone size={16} /> : <IconHash size={16} />) : <IconSpeaker size={16} />}
            <h2 className="truncate text-[12px] font-bold uppercase leading-4 tracking-[0.02em]">{channel.name}</h2>
          </div>
          <SettingsNavItem active={section === "overview"} onClick={() => setSection("overview")}>Overview</SettingsNavItem>
          <SettingsNavItem active={section === "permissions"} onClick={() => setSection("permissions")}>Permissions</SettingsNavItem>
          <SettingsNavSeparator />
          <SettingsNavItem danger active={section === "delete"} onClick={() => setSection("delete")} trailing={<IconTrash size={16} />}>
            Delete Channel
          </SettingsNavItem>
        </>
      }
    >
      <h2 className="mb-5 text-[20px] font-semibold leading-6 text-header-primary">
        {section === "overview" ? "Overview" : section === "permissions" ? "Channel Permissions" : "Delete Channel"}
      </h2>
      {section === "overview" && (
        <>
          <section>
            <div className="mt-2 space-y-3">
              <label className="block">
                <span className="text-[12px] font-bold uppercase leading-4 tracking-[0.02em] text-header-secondary">Channel name</span>
                <div className="mt-1 flex items-center">
                  <span className="mr-2 text-text-muted">
                    {channel.type === "text" ? (
                      readOnly ? (
                        <IconMegaphone size={14} />
                      ) : (
                        <IconHash size={14} />
                      )
                    ) : (
                      <IconSpeaker size={14} />
                    )}
                  </span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-10 w-full rounded-[3px] border border-transparent bg-bg-tertiary px-2.5 text-[16px] text-text-normal outline-none focus:border-[#00a8fc]"
                    maxLength={32}
                  />
                </div>
              </label>

              <label className="flex cursor-pointer items-center justify-between gap-4 border-y border-divider/60 py-4">
                <span>
                  <span className="block text-[16px] font-medium text-header-primary">Announcement Channel</span>
                  <span className="mt-1 block text-[14px] text-text-muted">
                    Only people who can manage channels may post here.
                  </span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={readOnly}
                  onClick={() => setReadOnly(!readOnly)}
                  className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${readOnly ? "bg-status-online" : "bg-[#80848e]"}`}
                >
                  <span
                    className={`absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white transition-all ${readOnly ? "left-[19px]" : "left-[3px]"}`}
                  />
                </button>
              </label>
            </div>
          </section>

        </>
      )}
      {section === "permissions" && (
          <section>
            <p className="mb-4 text-[14px] leading-5 text-text-muted">
              Tap a cell to cycle Default → Allow → Deny. "Default" follows the role's own settings; once any
              role has an override here, channels not allowed for a role are hidden and read-only.
            </p>
            {/* Desktop: permission table. Hidden on small screens where its
                520px minimum would force sideways scrolling. */}
            <div className="mt-2 hidden overflow-x-auto sm:block">
              <div className="min-w-[520px]">
                <div className="grid grid-cols-[1fr_repeat(4,72px)] items-center gap-1 border-b border-divider pb-1">
                  <span className="text-[11px] font-bold uppercase text-text-muted">Role</span>
                  {ACTIONS.map((a) => (
                    <span key={a.key} className="text-center text-[11px] font-bold uppercase text-text-muted">
                      {a.label}
                    </span>
                  ))}
                </div>
                {rows === null ? (
                  <p className="py-4 text-center text-sm text-text-muted">Loading permissions…</p>
                ) : (
                  <div className="divide-y divide-divider/60">
                    {rows.map((r) => (
                      <div key={r.role_id} className="grid grid-cols-[1fr_repeat(4,72px)] items-center gap-1 py-1.5">
                        <span className="min-w-0 truncate text-sm" style={{ color: r.role_color }}>
                          {r.role_name}
                        </span>
                        {ACTIONS.map((a) => renderCell(r.role_id, a, "mx-auto"))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {/* Mobile: stacked role cards with labeled toggles instead of a
                sideways-scrolling table. Same state via renderCell. */}
            <div className="mt-2 space-y-2 sm:hidden">
              {rows === null ? (
                <p className="py-4 text-center text-sm text-text-muted">Loading permissions…</p>
              ) : (
                rows.map((r) => (
                  <div key={r.role_id} className="rounded-lg border border-divider bg-bg-secondary p-3">
                    <p className="mb-2 truncate text-sm font-semibold" style={{ color: r.role_color }}>
                      {r.role_name}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {ACTIONS.map((a) => (
                        <div
                          key={a.key}
                          className="flex items-center justify-between gap-2 rounded bg-bg-accent px-2 py-1.5"
                        >
                          <span className="text-[11px] font-bold uppercase text-text-muted">{a.label}</span>
                          {renderCell(r.role_id, a, "min-w-[64px]")}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

      )}
      {section === "delete" && (
          <section className="rounded-lg border border-status-dnd/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[14px] text-text-normal">
                Permanently delete <span className="font-semibold text-text-normal">#{channel.name}</span> with its
                history and permissions. This cannot be undone.
              </p>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="h-[38px] shrink-0 rounded-[3px] bg-button-danger px-4 text-[14px] font-medium text-white hover:bg-button-danger-hover"
              >
                Delete Channel
              </button>
            </div>
          </section>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${channel.type === "voice" ? "" : "#"}${channel.name}?`}
        body="Every message in it is removed for good. This can't be undone."
        confirmLabel="Delete Channel"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          const err = await app.deleteChannel(channel.id);
          setConfirmDelete(false);
          if (err) setError(err);
          else onClose();
        }}
      />

      {section !== "delete" && (error || saved || dirty) && (
        <div className="view-enter sticky bottom-5 mt-8 flex items-center justify-between gap-3 rounded-[5px] bg-bg-floating px-4 py-2.5 shadow-[var(--elevation-high)]">
          <p className="text-[14px] font-medium text-text-normal">
            {error ? <span className="text-status-dnd">{error}</span> : saved && !dirty ? "Changes saved." : "Careful — you have unsaved changes!"}
          </p>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="h-8 shrink-0 rounded-[3px] bg-button-green px-4 text-[14px] font-medium text-white transition-colors hover:bg-button-green-hover disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      )}
    </SettingsLayer>
  );
}

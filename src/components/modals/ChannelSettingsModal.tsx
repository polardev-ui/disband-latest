"use client";

import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { IconClose, IconHash, IconSpeaker, IconTrash } from "@/components/icons";
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

export function ChannelSettingsModal({ channel, onClose }: ChannelSettingsModalProps) {
  const app = useApp();
  const [name, setName] = useState("");
  const [readOnly, setReadOnly] = useState(false);
  const [rows, setRows] = useState<RolePermRow[] | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    void loadRows(channel.id);
  }, [channel, loadRows]);

  if (!channel) return null;

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
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-bg-primary shadow-2xl">
        <header className="flex items-center gap-2 border-b border-divider px-5 py-4">
          {channel.type === "text" ? <IconHash size={20} /> : <IconSpeaker size={20} />}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-bold text-text-normal">Channel Settings</h2>
            <p className="truncate text-xs text-text-muted">
              {channel.type === "text" ? "Text channel" : "Voice channel"} · #{channel.name}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-text-muted hover:text-text-normal">
            <IconClose size={20} />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wide text-text-muted">Overview</h3>
            <div className="mt-2 space-y-3">
              <label className="block">
                <span className="text-xs font-semibold text-text-muted">Channel name</span>
                <div className="mt-1 flex items-center">
                  <span className="mr-2 text-text-muted">
                    {channel.type === "text" ? <IconHash size={14} /> : <IconSpeaker size={14} />}
                  </span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded bg-bg-accent px-3 py-2 text-sm text-text-normal outline-none focus:ring-2 focus:ring-brand"
                    maxLength={32}
                  />
                </div>
              </label>

              <label className="flex cursor-pointer items-center justify-between rounded bg-bg-accent px-3 py-2.5">
                <span>
                  <span className="block text-sm font-semibold text-text-normal">Announcement channel</span>
                  <span className="block text-xs text-text-muted">
                    Only people who can manage channels may post here.
                  </span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={readOnly}
                  onClick={() => setReadOnly(!readOnly)}
                  className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${readOnly ? "bg-brand" : "bg-bg-secondary"}`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${readOnly ? "left-[18px]" : "left-0.5"}`}
                  />
                </button>
              </label>
            </div>
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-wide text-text-muted">Role permissions</h3>
            <p className="mt-0.5 text-xs text-text-muted">
              Tap a cell to cycle Default → Allow → Deny. "Default" follows the role's own settings; once any
              role has an override here, channels not allowed for a role are hidden and read-only.
            </p>
            <div className="mt-2 overflow-x-auto">
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
                        {ACTIONS.map((a) => {
                          const value = draft[r.role_id]?.[a.key] ?? null;
                          const fallback = rolePerms(r.role_id)[a.key];
                          return (
                            <button
                              key={a.key}
                              type="button"
                              title={
                                value === null
                                  ? `Default (${fallback ? "allowed" : "denied"} by role settings)`
                                  : value
                                    ? "Override: allowed"
                                    : "Override: denied"
                              }
                              onClick={() => setCell(r.role_id, a.key, cycle(value))}
                              className={`mx-auto flex items-center justify-center rounded px-1.5 py-1 text-[11px] font-semibold transition-colors ${
                                value === null
                                  ? "bg-bg-accent text-text-muted"
                                  : value
                                    ? "bg-emerald-500/15 text-emerald-400"
                                    : "bg-status-dnd/15 text-status-dnd"
                              }`}
                            >
                              {value === null ? "Default" : value ? "Allow" : "Deny"}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="rounded border border-status-dnd/20 bg-status-dnd/10 px-3 py-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-status-dnd">Danger zone</h3>
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-xs text-text-muted">
                Permanently delete <span className="font-semibold text-text-normal">#{channel.name}</span> with its
                history and permissions. This cannot be undone.
              </p>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Delete #${channel.name}? This cannot be undone.`)) {
                    void app.deleteChannel(channel.id);
                    onClose();
                  }
                }}
                className="shrink-0 rounded bg-status-dnd px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
              >
                <IconTrash size={12} className="mr-1 inline" />
                Delete
              </button>
            </div>
          </section>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-divider px-5 py-3">
          <div className="min-w-0">
            {error && <p className="text-xs text-status-dnd">{error}</p>}
            {!error && saved && <p className="text-xs text-emerald-400">Changes saved.</p>}
            {!error && !saved && <p className="text-xs text-text-muted">Hit save to apply your edits.</p>}
          </div>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-brand-hover disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </footer>
      </div>
    </div>
  );
}
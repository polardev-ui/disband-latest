"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useMediaUpload } from "@/hooks/useMediaUpload";
import {
  IconClose,
  IconCopy,
  IconTrash,
  IconSettings,
  IconLink,
  IconShield,
  IconPalette,
  IconAlert,
} from "@/components/icons";
import { getInviteUrl, serverInitials } from "@/lib/utils";

interface ServerSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

type Section = "overview" | "invite" | "roles" | "appearance" | "danger";

const NAV: { id: Section; label: string; icon: typeof IconSettings; ownerOnly?: boolean }[] = [
  { id: "overview", label: "Overview", icon: IconSettings },
  { id: "invite", label: "Invites", icon: IconLink },
  { id: "roles", label: "Roles", icon: IconShield, ownerOnly: true },
  { id: "appearance", label: "Appearance", icon: IconPalette, ownerOnly: true },
  { id: "danger", label: "Danger Zone", icon: IconAlert, ownerOnly: true },
];

export function ServerSettingsModal({ open, onClose }: ServerSettingsModalProps) {
  const { activeServer, updateServer, deleteServer, user, serverRoles, createRole } = useApp();
  const { upload } = useMediaUpload();
  const [section, setSection] = useState<Section>("overview");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [roleName, setRoleName] = useState("");
  const [roleColor, setRoleColor] = useState("#5865f2");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!activeServer) return;
    setName(activeServer.name);
    setDescription(activeServer.description ?? "");
    setSection("overview");
  }, [activeServer, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !activeServer) return null;
  const isOwner = activeServer.owner_id === user?.id;
  const inviteUrl = activeServer.invite_code ? getInviteUrl(activeServer.invite_code) : null;
  const navItems = NAV.filter((n) => !n.ownerOnly || isOwner);

  async function saveOverview() {
    setLoading(true);
    setError(null);
    const err = await updateServer(activeServer!.id, { name, description });
    if (err) setError(err);
    else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setLoading(false);
  }

  async function handleDelete() {
    if (!confirm(`Delete "${activeServer!.name}" permanently? This cannot be undone.`)) return;
    setLoading(true);
    const err = await deleteServer(activeServer!.id);
    if (err) setError(err);
    else onClose();
    setLoading(false);
  }

  async function handleIcon(file: File) {
    const res = await upload(file);
    if (res) await updateServer(activeServer!.id, { icon_url: res.url });
  }

  async function handleBanner(file: File) {
    const res = await upload(file);
    if (res) await updateServer(activeServer!.id, { banner_url: res.url });
  }

  async function handleCreateRole() {
    if (!roleName.trim()) return;
    setLoading(true);
    const err = await createRole({ name: roleName.trim(), color: roleColor });
    if (err) setError(err);
    else setRoleName("");
    setLoading(false);
  }

  function copyInvite() {
    if (!inviteUrl) return;
    void navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-bg-primary">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-divider px-6">
        <div className="flex items-center gap-3">
          {activeServer.icon_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={activeServer.icon_url} alt="" className="h-8 w-8 rounded-[30%] object-cover" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-[30%] bg-brand text-xs font-bold text-white">
              {serverInitials(activeServer.name)}
            </div>
          )}
          <div>
            <h1 className="font-bold">{activeServer.name}</h1>
            <p className="text-xs text-text-muted">Server Settings</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-2 text-text-muted transition-colors hover:bg-interactive-hover hover:text-text-normal"
          aria-label="Close"
        >
          <IconClose size={24} />
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="hidden w-56 shrink-0 flex-col border-r border-divider bg-bg-secondary p-4 md:flex">
          <label className="mb-2 px-2 text-xs font-bold uppercase text-text-muted">Settings</label>
          <select
            value={section}
            onChange={(e) => setSection(e.target.value as Section)}
            className="mb-4 w-full rounded bg-bg-accent px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-brand md:hidden"
          >
            {navItems.map((n) => (
              <option key={n.id} value={n.id}>{n.label}</option>
            ))}
          </select>
          {navItems.map((n) => {
            const Icon = n.icon;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => setSection(n.id)}
                className={`mb-0.5 hidden w-full items-center gap-2 rounded px-2 py-2 text-left text-sm transition-colors md:flex ${
                  section === n.id ? "bg-interactive-selected text-text-normal" : "text-text-muted hover:bg-interactive-hover"
                }`}
              >
                <Icon size={16} /> {n.label}
              </button>
            );
          })}
        </nav>

        <div className="flex-1 overflow-y-auto p-6 md:p-10">
          <div className="mx-auto max-w-2xl">
            {section === "overview" && (
              <div className="space-y-5">
                <h2 className="text-xl font-bold">Overview</h2>
                <p className="text-sm text-text-muted">Basic information about your server.</p>
                <label className="block">
                  <span className="text-xs font-bold uppercase text-text-muted">Server name</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={!isOwner}
                    className="mt-1 w-full rounded bg-bg-accent px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand disabled:opacity-60"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase text-text-muted">Description</span>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={!isOwner}
                    rows={4}
                    placeholder="Tell people what this server is about"
                    className="mt-1 w-full resize-none rounded bg-bg-accent px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand disabled:opacity-60"
                  />
                </label>
                {isOwner && (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void saveOverview()}
                    className="rounded bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
                  >
                    Save Changes
                  </button>
                )}
                {saved && <p className="text-sm text-status-online">Saved!</p>}
              </div>
            )}

            {section === "invite" && (
              <div className="space-y-5">
                <h2 className="text-xl font-bold">Invites</h2>
                <p className="text-sm text-text-muted">Share this link to invite people to your server.</p>
                {inviteUrl ? (
                  <div className="rounded-lg border border-divider bg-bg-secondary p-5">
                    <p className="break-all font-mono text-sm">{inviteUrl}</p>
                    <button
                      type="button"
                      onClick={copyInvite}
                      className="mt-4 flex items-center gap-2 rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
                    >
                      <IconCopy size={16} /> {copied ? "Copied!" : "Copy Invite Link"}
                    </button>
                    <p className="mt-3 text-xs text-text-muted">
                      Paste this link in chat to show a rich invite preview with Join Server button.
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-text-muted">Invite code not available — run migration 0004.</p>
                )}
              </div>
            )}

            {section === "roles" && isOwner && (
              <div className="space-y-5">
                <h2 className="text-xl font-bold">Roles</h2>
                <p className="text-sm text-text-muted">Create roles and assign them via right-click on members. Role colors change name colors.</p>
                <ul className="divide-y divide-divider rounded-lg border border-divider bg-bg-secondary">
                  {serverRoles.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="h-4 w-4 rounded-full" style={{ backgroundColor: r.color }} />
                      <span className="font-medium">{r.name}</span>
                      {r.is_default && <span className="text-xs text-text-muted">Default</span>}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  <input
                    value={roleName}
                    onChange={(e) => setRoleName(e.target.value)}
                    placeholder="Role name"
                    className="min-w-[160px] flex-1 rounded bg-bg-accent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand"
                  />
                  <input type="color" value={roleColor} onChange={(e) => setRoleColor(e.target.value)} className="h-10 w-14 cursor-pointer rounded" />
                  <button type="button" onClick={() => void handleCreateRole()} disabled={loading} className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white">
                    Create Role
                  </button>
                </div>
              </div>
            )}

            {section === "appearance" && isOwner && (
              <div className="space-y-5">
                <h2 className="text-xl font-bold">Appearance</h2>
                <p className="text-sm text-text-muted">Customize how your server looks in invites and the sidebar.</p>
                <label className="flex cursor-pointer items-center justify-between rounded-lg border border-divider bg-bg-secondary p-4 hover:bg-interactive-hover">
                  <div>
                    <p className="font-medium">Server icon</p>
                    <p className="text-xs text-text-muted">Recommended 512×512</p>
                  </div>
                  <input type="file" accept="image/*" className="text-sm" onChange={(e) => e.target.files?.[0] && void handleIcon(e.target.files[0])} />
                </label>
                <label className="flex cursor-pointer items-center justify-between rounded-lg border border-divider bg-bg-secondary p-4 hover:bg-interactive-hover">
                  <div>
                    <p className="font-medium">Server banner</p>
                    <p className="text-xs text-text-muted">Shown on invite previews</p>
                  </div>
                  <input type="file" accept="image/*" className="text-sm" onChange={(e) => e.target.files?.[0] && void handleBanner(e.target.files[0])} />
                </label>
              </div>
            )}

            {section === "danger" && isOwner && (
              <div className="space-y-5">
                <h2 className="text-xl font-bold text-status-dnd">Danger Zone</h2>
                <div className="rounded-lg border border-status-dnd/30 bg-status-dnd/5 p-5">
                  <p className="font-medium">Delete this server</p>
                  <p className="mt-1 text-sm text-text-muted">Permanently delete all channels, messages, and members. This cannot be undone.</p>
                  <button
                    type="button"
                    onClick={() => void handleDelete()}
                    disabled={loading}
                    className="mt-4 flex items-center gap-2 rounded bg-status-dnd px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                  >
                    <IconTrash size={16} /> Delete Server
                  </button>
                </div>
              </div>
            )}

            {error && <p className="mt-4 text-sm text-status-dnd">{error}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useMediaUpload } from "@/hooks/useMediaUpload";
import { IconClose, IconCopy, IconTrash } from "@/components/icons";
import { getInviteUrl } from "@/lib/utils";

interface ServerSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function ServerSettingsModal({ open, onClose }: ServerSettingsModalProps) {
  const { activeServer, updateServer, deleteServer, user, serverRoles, createRole } = useApp();
  const { upload } = useMediaUpload();
  const [name, setName] = useState(activeServer?.name ?? "");
  const [description, setDescription] = useState(activeServer?.description ?? "");
  const [roleName, setRoleName] = useState("");
  const [roleColor, setRoleColor] = useState("#5865f2");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!activeServer) return;
    setName(activeServer.name);
    setDescription(activeServer.description ?? "");
  }, [activeServer]);

  if (!open || !activeServer) return null;
  const isOwner = activeServer.owner_id === user?.id;
  const inviteUrl = activeServer.invite_code ? getInviteUrl(activeServer.invite_code) : null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const err = await updateServer(activeServer!.id, { name, description });
    if (err) setError(err);
    else onClose();
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

  async function handleCreateRole(e: React.FormEvent) {
    e.preventDefault();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/70" onClick={onClose} />
      <form onSubmit={save} className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg bg-bg-primary p-6 shadow-2xl">
        <button type="button" onClick={onClose} className="absolute right-4 top-4 text-text-muted">
          <IconClose size={24} />
        </button>
        <h2 className="text-xl font-bold">Server Settings</h2>

        {inviteUrl && (
          <div className="mt-4 rounded bg-bg-accent p-3">
            <p className="text-xs font-bold uppercase text-text-muted">Invite Link</p>
            <p className="mt-1 truncate text-sm">{inviteUrl}</p>
            <button
              type="button"
              onClick={copyInvite}
              className="mt-2 flex items-center gap-1 text-sm text-brand hover:underline"
            >
              <IconCopy size={14} /> {copied ? "Copied!" : "Copy link"}
            </button>
          </div>
        )}

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-xs font-bold uppercase text-text-muted">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!isOwner}
              className="mt-1 w-full rounded bg-bg-accent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand disabled:opacity-60"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase text-text-muted">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!isOwner}
              rows={3}
              className="mt-1 w-full resize-none rounded bg-bg-accent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand disabled:opacity-60"
            />
          </label>
          {isOwner && (
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-brand hover:underline">
              Change icon
              <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && void handleIcon(e.target.files[0])} />
            </label>
          )}
        </div>

        {isOwner && (
          <div className="mt-6 border-t border-divider pt-4">
            <h3 className="font-semibold">Roles</h3>
            <ul className="mt-2 space-y-1">
              {serverRoles.map((r) => (
                <li key={r.id} className="flex items-center gap-2 text-sm">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: r.color }} />
                  {r.name}
                  {r.is_default && <span className="text-xs text-text-muted">(default)</span>}
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                placeholder="New role name"
                className="flex-1 rounded bg-bg-accent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand"
              />
              <input type="color" value={roleColor} onChange={(e) => setRoleColor(e.target.value)} className="h-10 w-12 cursor-pointer rounded" />
              <button type="button" onClick={(e) => void handleCreateRole(e)} disabled={loading} className="rounded bg-brand px-3 py-2 text-sm font-semibold text-white">
                Add Role
              </button>
            </div>
            <p className="mt-2 text-xs text-text-muted">Right-click a member to assign roles, kick, or ban.</p>
          </div>
        )}

        {error && <p className="mt-2 text-sm text-status-dnd">{error}</p>}

        <div className="mt-4 flex gap-2">
          {isOwner && (
            <button type="submit" disabled={loading} className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50">
              Save
            </button>
          )}
          {isOwner && (
            <button type="button" onClick={() => void handleDelete()} className="ml-auto flex items-center gap-1 rounded bg-status-dnd/20 px-4 py-2 text-sm font-semibold text-status-dnd hover:bg-status-dnd hover:text-white">
              <IconTrash size={16} /> Delete Server
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

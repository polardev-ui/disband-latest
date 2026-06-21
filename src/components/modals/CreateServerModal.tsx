"use client";

import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useMediaUpload } from "@/hooks/useMediaUpload";
import { IconClose, IconUpload } from "@/components/icons";

interface CreateServerModalProps {
  open: boolean;
  onClose: () => void;
}

export function CreateServerModal({ open, onClose }: CreateServerModalProps) {
  const { createServer } = useApp();
  const { upload, isUploading } = useMediaUpload();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  async function handleIcon(file: File) {
    const res = await upload(file);
    if (res) setIconUrl(res.url);
  }

  async function handleBanner(file: File) {
    const res = await upload(file);
    if (res) setBannerUrl(res.url);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const err = await createServer({
      name: name.trim(),
      description: description.trim() || undefined,
      iconUrl: iconUrl ?? undefined,
      bannerUrl: bannerUrl ?? undefined,
    });
    if (err) setError(err);
    else onClose();
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/70" onClick={onClose} />
      <form onSubmit={submit} className="relative w-full max-w-md rounded-lg bg-bg-primary p-6 shadow-2xl">
        <button type="button" onClick={onClose} className="absolute right-4 top-4 text-text-muted hover:text-text-normal">
          <IconClose size={24} />
        </button>
        <h2 className="text-xl font-bold text-text-normal">Create your space</h2>
        <p className="mt-1 text-sm text-text-muted">Customize your server name, icon, and banner.</p>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-xs font-bold uppercase text-text-muted">Server name</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded bg-bg-accent px-3 py-2 text-sm text-text-normal outline-none focus:ring-2 focus:ring-brand"
              placeholder="My awesome space"
            />
          </label>

          <label className="block">
            <span className="text-xs font-bold uppercase text-text-muted">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1 w-full resize-none rounded bg-bg-accent px-3 py-2 text-sm text-text-normal outline-none focus:ring-2 focus:ring-brand"
            />
          </label>

          <div className="flex gap-3">
            <label className="flex flex-1 cursor-pointer flex-col items-center gap-1 rounded border border-dashed border-divider p-3 text-center transition-all duration-150 hover:border-brand">
              <IconUpload className="text-text-muted" />
              <span className="text-xs text-text-muted">Server icon</span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && void handleIcon(e.target.files[0])} />
              {iconUrl && <img src={iconUrl} alt="" className="mt-1 h-10 w-10 rounded-[30%] object-cover" />}
            </label>
            <label className="flex flex-1 cursor-pointer flex-col items-center gap-1 rounded border border-dashed border-divider p-3 text-center transition-all duration-150 hover:border-brand">
              <IconUpload className="text-text-muted" />
              <span className="text-xs text-text-muted">Banner</span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && void handleBanner(e.target.files[0])} />
              {bannerUrl && <img src={bannerUrl} alt="" className="mt-1 h-10 w-full rounded object-cover" />}
            </label>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-status-dnd">{error}</p>}

        <button
          type="submit"
          disabled={loading || isUploading}
          className="mt-4 w-full rounded bg-brand py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:bg-brand-hover disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create Server"}
        </button>
      </form>
    </div>
  );
}

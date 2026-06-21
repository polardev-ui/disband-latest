"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@/components/theme/ThemeProvider";
import { useApp } from "@/contexts/AppContext";
import { useMediaUpload } from "@/hooks/useMediaUpload";
import { AvatarCropModal } from "@/components/modals/AvatarCropModal";
import { Avatar } from "@/components/ui/Avatar";
import { IconClose } from "@/components/icons";
import type { AvatarCrop } from "@/lib/utils";
import type { UserStatus } from "@/lib/supabase/types";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const STATUSES: { id: UserStatus; label: string }[] = [
  { id: "online", label: "Online" },
  { id: "idle", label: "Idle" },
  { id: "dnd", label: "Do Not Disturb" },
  { id: "offline", label: "Invisible" },
];

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { theme, themes, setTheme } = useTheme();
  const { profile, updateProfile, signOut } = useApp();
  const { upload, isUploading } = useMediaUpload();
  const [tab, setTab] = useState<"profile" | "appearance">("profile");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [accent, setAccent] = useState("#5865f2");
  const [status, setStatus] = useState<UserStatus>("online");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSource, setCropSource] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name ?? "");
    setUsername(profile.username ?? "");
    setBio(profile.bio ?? "");
    setAccent(profile.accent_color ?? "#5865f2");
    setStatus(profile.status);
  }, [profile]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function saveProfile() {
    setError(null);
    const err = await updateProfile({
      display_name: displayName.trim() || null,
      username: username.trim() || null,
      bio: bio.trim() || null,
      accent_color: accent,
      status,
    });
    if (err) setError(err);
    else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  function pickAvatar(file: File) {
    const url = URL.createObjectURL(file);
    setCropSource(url);
    setCropOpen(true);
  }

  async function saveAvatarCrop(crop: AvatarCrop, blob: Blob) {
    const file = new File([blob], "avatar.jpg", { type: "image/jpeg" });
    const res = await upload(file);
    if (res) {
      await updateProfile({ avatar_url: res.url, avatar_crop: crop });
    }
    setCropOpen(false);
    if (cropSource) URL.revokeObjectURL(cropSource);
    setCropSource(null);
  }

  async function handleBanner(file: File) {
    const res = await upload(file);
    if (res) await updateProfile({ banner_url: res.url });
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <button type="button" aria-label="Close" className="absolute inset-0 bg-black/70" onClick={onClose} />
        <div className="relative flex max-h-[85vh] w-full max-w-[720px] overflow-hidden rounded-md bg-bg-primary shadow-2xl">
          <nav className="hidden w-56 shrink-0 flex-col bg-bg-secondary p-4 sm:flex">
            <h2 className="mb-4 px-2 text-xs font-bold uppercase text-text-muted">User Settings</h2>
            {(["profile", "appearance"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded px-2 py-1.5 text-left text-[15px] capitalize transition-all duration-150 ease-in-out ${
                  tab === t ? "bg-interactive-selected text-text-normal" : "text-text-muted hover:bg-interactive-hover"
                }`}
              >
                {t}
              </button>
            ))}
            <button
              type="button"
              onClick={() => void signOut()}
              className="mt-auto rounded px-2 py-1.5 text-left text-[15px] text-status-dnd transition-all duration-150 hover:bg-interactive-hover"
            >
              Log Out
            </button>
          </nav>

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex items-center justify-between border-b border-divider px-6 py-4">
              <h1 className="text-xl font-semibold capitalize">{tab}</h1>
              <button type="button" onClick={onClose} className="text-text-muted hover:text-text-normal">
                <IconClose size={24} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-6">
              {tab === "profile" && (
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    {profile && <Avatar profile={profile} size="lg" />}
                    <div>
                      <p className="font-semibold">{displayName || username}</p>
                      <label className="cursor-pointer text-sm text-brand hover:underline">
                        {isUploading ? "Uploading..." : "Change avatar"}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => e.target.files?.[0] && pickAvatar(e.target.files[0])}
                        />
                      </label>
                    </div>
                  </div>

                  <label className="block">
                    <span className="text-xs font-bold uppercase text-text-muted">Display name</span>
                    <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="mt-1 w-full rounded bg-bg-accent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-bold uppercase text-text-muted">Username</span>
                    <input value={username} onChange={(e) => setUsername(e.target.value)} className="mt-1 w-full rounded bg-bg-accent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-bold uppercase text-text-muted">Bio</span>
                    <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} className="mt-1 w-full resize-none rounded bg-bg-accent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-bold uppercase text-text-muted">Accent color</span>
                    <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="mt-1 h-10 w-full cursor-pointer rounded bg-bg-accent" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-bold uppercase text-text-muted">Banner</span>
                    <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && void handleBanner(e.target.files[0])} className="mt-1 block text-sm text-text-muted" />
                  </label>
                  <div>
                    <span className="text-xs font-bold uppercase text-text-muted">Status</span>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {STATUSES.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setStatus(s.id)}
                          className={`rounded px-3 py-1.5 text-sm transition-all duration-150 ${
                            status === s.id ? "bg-brand text-white" : "bg-bg-accent text-text-muted hover:text-text-normal"
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {error && <p className="text-sm text-status-dnd">{error}</p>}
                  {saved && <p className="text-sm text-status-online">Saved!</p>}
                  <button type="button" onClick={() => void saveProfile()} className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover">
                    Save Changes
                  </button>
                </div>
              )}

              {tab === "appearance" && (
                <div>
                  <p className="mb-4 text-sm text-text-muted">Theme changes apply instantly across web and desktop.</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {themes.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTheme(t.id)}
                        className={`overflow-hidden rounded-lg border-2 text-left transition-all duration-150 ${
                          theme === t.id ? "border-brand" : "border-transparent hover:border-interactive-hover"
                        }`}
                      >
                        <div className="flex h-16">
                          {t.swatch.map((c, i) => (
                            <div key={i} className="flex-1" style={{ backgroundColor: c }} />
                          ))}
                        </div>
                        <div className="bg-bg-secondary px-3 py-2">
                          <p className="text-sm font-semibold">{t.label}</p>
                          <p className="text-xs text-text-muted">{t.description}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {cropSource && (
        <AvatarCropModal
          open={cropOpen}
          imageUrl={cropSource}
          onClose={() => {
            setCropOpen(false);
            URL.revokeObjectURL(cropSource);
            setCropSource(null);
          }}
          onSave={(crop, blob) => void saveAvatarCrop(crop, blob)}
        />
      )}
    </>
  );
}

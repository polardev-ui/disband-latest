"use client";

import { useCallback, useEffect, useState } from "react";
import { useTheme } from "@/components/theme/ThemeProvider";
import { useApp } from "@/contexts/AppContext";
import { useMediaUpload } from "@/hooks/useMediaUpload";
import { AvatarCropModal } from "@/components/modals/AvatarCropModal";
import { Avatar } from "@/components/ui/Avatar";
import { IconClose, IconBell, IconDownload } from "@/components/icons";
import { NewPasswordForm } from "@/components/auth/NewPasswordForm";
import { MfaSettingsPanel } from "@/components/auth/MfaSettingsPanel";
import { UsernameAvailabilityInput } from "@/components/discord/UsernameAvailabilityInput";
import { PlatformModerationPanel } from "@/components/discord/PlatformModerationPanel";
import { MAX_BIO_LENGTH } from "@/lib/word-limit";
import { requestNotificationPermissionFromGesture } from "@/lib/notifications";
import { useAudioDevices } from "@/hooks/useAudioDevices";
import { getDisbandUserMedia } from "@/lib/media";
import {
  getPreferredAudioInputId,
  getPreferredAudioOutputId,
  getPreferredVideoInputId,
  setPreferredAudioInputId,
  setPreferredAudioOutputId,
  setPreferredVideoInputId,
} from "@/lib/audio-settings";
import {
  DEFAULT_ACCENT,
  getAvatarStyle,
  getProfilePanelMutedColor,
  getProfilePanelStyle,
  isProfileGradient,
  usesCustomAccent,
  type ProfileAccentFields,
} from "@/lib/profileColor";
import type { AvatarCrop } from "@/lib/utils";
import type { UserStatus, Profile } from "@/lib/supabase/types";
import { SubscriptionBadge } from "@/components/ui/SubscriptionBadge";
import { SubscriptionModal } from "@/components/subscription/SubscriptionModal";
import { PLANS } from "@/lib/subscription";
import { useSubscription } from "@/hooks/useSubscription";
import { getSupabaseClient } from "@/lib/supabase/client";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const TABS = [
  { id: "profile" as const, label: "Profile" },
  { id: "account" as const, label: "Account" },
  { id: "subscriptions" as const, label: "Subscriptions" },
  { id: "appearance" as const, label: "Appearance" },
  { id: "notifications" as const, label: "Notifications" },
  { id: "voice" as const, label: "Voice & Video" },
  { id: "textMedia" as const, label: "Text & Media" },
];

function SettingRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-divider bg-bg-secondary p-4 hover:bg-interactive-hover/40">
      <div>
        <p className="font-medium">{label}</p>
        {description && <p className="mt-0.5 text-xs text-text-muted">{description}</p>}
      </div>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 accent-brand"
      />
    </label>
  );
}

const STATUSES: { id: UserStatus; label: string }[] = [
  { id: "online", label: "Online" },
  { id: "idle", label: "Idle" },
  { id: "dnd", label: "Do Not Disturb" },
  { id: "offline", label: "Invisible" },
];

type SettingsTab = (typeof TABS)[number]["id"];

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { theme, themes, setTheme } = useTheme();
  const { profile, user, updateProfile, updatePassword, requestPasswordReset, signOut } = useApp();
  const { upload, isUploading } = useMediaUpload();
  const [tab, setTab] = useState<SettingsTab>("profile");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [accent1, setAccent1] = useState(DEFAULT_ACCENT);
  const [accent2, setAccent2] = useState("#eb459e");
  const [useDefaultAccent, setUseDefaultAccent] = useState(true);
  const [status, setStatus] = useState<UserStatus>("online");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [cropSourceFile, setCropSourceFile] = useState<File | null>(null);
  const [showSubscription, setShowSubscription] = useState(false);
  const { subscription, plan: subPlan, entitlements } = useSubscription(profile?.id);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [desktopNotifications, setDesktopNotifications] = useState(true);
  const [linkPreviews, setLinkPreviews] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">("default");
  const [audioInput, setAudioInput] = useState("");
  const [audioOutput, setAudioOutput] = useState("");
  const [videoInput, setVideoInput] = useState("");
  const [mediaTestMessage, setMediaTestMessage] = useState<string | null>(null);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { inputs, outputs, cameras, loading: devicesLoading, refresh: refreshDevices } = useAudioDevices();

  useEffect(() => {
    if (!open) return;
    setAudioInput(getPreferredAudioInputId() ?? "");
    setAudioOutput(getPreferredAudioOutputId() ?? "");
    setVideoInput(getPreferredVideoInputId() ?? "");
    void refreshDevices();
  }, [open, refreshDevices]);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotifPermission(Notification.permission);
    } else {
      setNotifPermission("unsupported");
    }
  }, [open]);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name ?? "");
    setUsername(profile.username ?? "");
    setBio(profile.bio ?? "");
    const custom = usesCustomAccent(profile);
    setUseDefaultAccent(!custom);
    setAccent1(profile.accent_color ?? DEFAULT_ACCENT);
    setAccent2(profile.accent_color_2 ?? profile.accent_color ?? "#eb459e");
    setStatus(profile.preferred_status ?? profile.status);
    setSoundEnabled(profile.sound_enabled ?? true);
    setDesktopNotifications(profile.desktop_notifications_enabled ?? true);
    setLinkPreviews(profile.link_previews_enabled ?? true);
  }, [profile]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const exportHistory = useCallback(async () => {
    if (!profile?.id) return;
    setExporting(true);
    try {
      const supabase = getSupabaseClient();
      const [messages, dmMessages, groupMessages] = await Promise.all([
        supabase.from("messages").select("*, author:profiles(*)").eq("author_id", profile.id).order("created_at"),
        supabase.from("dm_messages").select("*, author:profiles(*)").eq("author_id", profile.id).order("created_at"),
        supabase.from("group_messages").select("*, author:profiles(*)").eq("author_id", profile.id).order("created_at"),
      ]);
      const data = {
        exported_at: new Date().toISOString(),
        user_id: profile.id,
        channel_messages: messages.data ?? [],
        dm_messages: dmMessages.data ?? [],
        group_messages: groupMessages.data ?? [],
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `disband-history-${profile.username ?? profile.id}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }, [profile]);

  if (!open) return null;

  const previewAccent: ProfileAccentFields = useDefaultAccent
    ? { accent_color: null, accent_color_2: null }
    : { accent_color: accent1, accent_color_2: accent2 };

  async function saveProfile() {
    setError(null);
    if (!useDefaultAccent && (!accent1.trim() || !accent2.trim())) {
      setError("Pick both profile colors, or use the default style.");
      return;
    }
    const err = await updateProfile({
      display_name: displayName.trim() || null,
      username: username.trim() || null,
      bio: bio.trim() || null,
      accent_color: useDefaultAccent ? null : accent1,
      accent_color_2: useDefaultAccent ? null : accent2,
      status,
    });
    if (err) setError(err);
    else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  function pickAvatar(file: File) {
    if (cropSource) URL.revokeObjectURL(cropSource);
    setCropSourceFile(file);
    setCropSource(URL.createObjectURL(file));
    setCropOpen(true);
  }

  async function saveAvatarCrop(crop: AvatarCrop) {
    if (!cropSourceFile) return;
    const res = await upload(cropSourceFile);
    if (res) {
      await updateProfile({ avatar_url: res.url, avatar_crop: crop });
    }
    setCropOpen(false);
    if (cropSource) URL.revokeObjectURL(cropSource);
    setCropSource(null);
    setCropSourceFile(null);
  }

  async function handleBanner(file: File) {
    const res = await upload(file);
    if (res) await updateProfile({ banner_url: res.url });
  }

  async function savePreference(
    patch: Partial<Pick<Profile, "sound_enabled" | "desktop_notifications_enabled" | "link_previews_enabled" | "theme">>,
  ) {
    setSettingsError(null);
    const err = await updateProfile(patch);
    if (err) setSettingsError(err);
  }

  async function enableDesktopNotifications() {
    const granted = await requestNotificationPermissionFromGesture();
    setNotifPermission(typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported");
    if (granted) {
      setDesktopNotifications(true);
      await savePreference({ desktop_notifications_enabled: true });
    }
  }

  async function testMediaAccess() {
    setMediaTestMessage(null);
    setSettingsError(null);
    try {
      const stream = await getDisbandUserMedia({ audio: true, video: true });
      stream.getTracks().forEach((track) => track.stop());
      setMediaTestMessage("Microphone and camera access granted.");
      await refreshDevices();
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "Could not access microphone or camera.");
    }
  }

  const activeTab = TABS.find((t) => t.id === tab);

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <button type="button" aria-label="Close" className="absolute inset-0 bg-black/70" onClick={onClose} />
        <div className="relative flex max-h-[85vh] w-full max-w-[720px] overflow-hidden rounded-md bg-bg-primary shadow-2xl">
          <nav className="hidden w-56 shrink-0 flex-col bg-bg-secondary p-4 sm:flex">
            <h2 className="mb-4 px-2 text-xs font-bold uppercase text-text-muted">User Settings</h2>
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`rounded px-2 py-1.5 text-left text-[15px] transition-all duration-150 ease-in-out ${
                  tab === t.id ? "bg-interactive-selected text-text-normal" : "text-text-muted hover:bg-interactive-hover"
                }`}
              >
                {t.label}
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
              <div className="min-w-0">
                <select
                  value={tab}
                  onChange={(e) => setTab(e.target.value as SettingsTab)}
                  className="w-full rounded bg-bg-accent px-2 py-1.5 text-lg font-semibold outline-none focus:ring-2 focus:ring-brand sm:hidden"
                >
                  {TABS.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
                <h1 className="hidden text-xl font-semibold sm:block">{activeTab?.label ?? "Settings"}</h1>
              </div>
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
                          accept={subPlan !== "free" ? "image/*,.gif" : "image/*"}
                          className="hidden"
                          onChange={(e) => e.target.files?.[0] && pickAvatar(e.target.files[0])}
                        />
                      </label>
                      {subPlan !== "free" && (
                        <p className="mt-0.5 text-xs text-text-muted">GIF supported for animated avatar</p>
                      )}
                    </div>
                  </div>

                  <label className="block">
                    <span className="text-xs font-bold uppercase text-text-muted">Display name</span>
                    <input value={displayName} onChange={(e) => setDisplayName(e.target.value.slice(0, 25))} maxLength={25} className="mt-1 w-full rounded bg-bg-accent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand" />
                  </label>
                  <div className="block">
                    <span className="text-xs font-bold uppercase text-text-muted">Username</span>
                    <UsernameAvailabilityInput
                      value={username}
                      onChange={setUsername}
                      currentUsername={profile?.username}
                    />
                  </div>
                  <label className="block">
                    <span className="text-xs font-bold uppercase text-text-muted">Bio</span>
                    <textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value.slice(0, MAX_BIO_LENGTH))}
                      rows={3}
                      maxLength={MAX_BIO_LENGTH}
                      placeholder="Tell people about yourself. Line breaks are allowed."
                      className="mt-1 w-full resize-none rounded bg-bg-accent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand"
                    />
                    <p className="mt-1 text-right text-xs text-text-muted">{bio.length}/{MAX_BIO_LENGTH}</p>
                  </label>
                  <div className="block">
                    <span className="text-xs font-bold uppercase text-text-muted">Profile color</span>
                    <p className="mt-0.5 text-xs text-text-muted">
                      Use the default Disband blue, or pick two colors — same color for solid, different for a gradient.
                    </p>

                    <label className="mt-3 flex cursor-pointer items-center gap-2 rounded bg-bg-accent px-3 py-2">
                      <input
                        type="radio"
                        name="accent-mode"
                        checked={useDefaultAccent}
                        onChange={() => setUseDefaultAccent(true)}
                        className="accent-brand"
                      />
                      <span className="text-sm">Default style</span>
                      <span
                        className="ml-auto h-6 w-6 rounded-full ring-1 ring-divider"
                        style={{ backgroundColor: DEFAULT_ACCENT }}
                      />
                    </label>

                    <label className="mt-2 flex cursor-pointer items-center gap-2 rounded bg-bg-accent px-3 py-2">
                      <input
                        type="radio"
                        name="accent-mode"
                        checked={!useDefaultAccent}
                        onChange={() => setUseDefaultAccent(false)}
                        className="accent-brand"
                      />
                      <span className="text-sm">Custom colors</span>
                    </label>

                    {!useDefaultAccent && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="block">
                          <span className="text-xs text-text-muted">Color 1</span>
                          <input
                            type="color"
                            value={accent1}
                            onChange={(e) => setAccent1(e.target.value)}
                            className="mt-1 h-10 w-full cursor-pointer rounded bg-bg-accent"
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs text-text-muted">Color 2</span>
                          <input
                            type="color"
                            value={accent2}
                            onChange={(e) => setAccent2(e.target.value)}
                            className="mt-1 h-10 w-full cursor-pointer rounded bg-bg-accent"
                          />
                        </label>
                      </div>
                    )}

                    <div className="mt-4 overflow-hidden rounded-lg border border-divider">
                      {profile?.banner_url && (
                        <div
                          className="h-16 bg-cover bg-center"
                          style={{ backgroundImage: `url(${profile.banner_url})` }}
                        />
                      )}
                      <div className="p-3" style={getProfilePanelStyle(previewAccent)}>
                        <div className="flex items-center gap-3">
                          <div
                            className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full text-lg font-bold ring-2 ring-black/15"
                            style={getAvatarStyle(previewAccent)}
                          >
                            {(displayName || username || "?").charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-base font-semibold leading-tight">
                              {displayName.trim() || username || "Display name"}
                            </p>
                            {username && (
                              <p className="text-sm" style={{ color: getProfilePanelMutedColor(previewAccent) }}>
                                @{username}
                              </p>
                            )}
                            <p className="mt-0.5 text-xs opacity-75">
                              {useDefaultAccent
                                ? "Default"
                                : isProfileGradient(previewAccent)
                                  ? "Gradient"
                                  : "Solid color"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <label className="block">
                    <span className="text-xs font-bold uppercase text-text-muted">Profile banner</span>
                    <p className="mt-0.5 text-xs text-text-muted">Shown on your profile when others view you</p>
                    {profile?.banner_url && (
                      <div
                        className="mt-2 h-20 rounded-lg bg-cover bg-center ring-1 ring-divider"
                        style={{ backgroundImage: `url(${profile.banner_url})` }}
                      />
                    )}
                    <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded bg-bg-accent px-3 py-2 text-sm text-brand hover:bg-interactive-hover">
                      {profile?.banner_url ? "Change banner" : "Upload banner"}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && void handleBanner(e.target.files[0])} />
                    </label>
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

              {tab === "account" && (
                <div className="space-y-6">
                  <div>
                    <span className="text-xs font-bold uppercase text-text-muted">Email</span>
                    <p className="mt-1 text-sm text-text-normal">{user?.email ?? "Not available"}</p>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-text-normal">Change password</h3>
                    <p className="mt-1 text-sm text-text-muted">
                      Set a new password while you are logged in.
                    </p>
                    <div className="mt-4">
                      <NewPasswordForm submitLabel="Update password" onSubmit={updatePassword} />
                    </div>
                  </div>

                  {user?.email && (
                    <div className="rounded-lg border border-divider bg-bg-secondary p-4">
                      <h3 className="text-sm font-semibold text-text-normal">Email reset link</h3>
                      <p className="mt-1 text-sm text-text-muted">
                        Prefer to reset from your inbox? We can send a link to {user.email}.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setSettingsError(null);
                          setResetEmailSent(false);
                          void (async () => {
                            const err = await requestPasswordReset(user.email!);
                            if (err) setSettingsError(err);
                            else setResetEmailSent(true);
                          })();
                        }}
                        className="mt-3 rounded bg-interactive-hover px-4 py-2 text-sm font-semibold text-text-normal hover:bg-interactive-selected"
                      >
                        Send reset email
                      </button>
                      {resetEmailSent && (
                        <p className="mt-2 text-sm text-status-online">Reset link sent. Check your inbox.</p>
                      )}
                    </div>
                  )}

                  <MfaSettingsPanel />

                  <PlatformModerationPanel />

                  {settingsError && <p className="text-sm text-status-dnd">{settingsError}</p>}
                </div>
              )}

              {tab === "appearance" && (
                <div>
                  <p className="mb-4 text-sm text-text-muted">Theme changes apply instantly and sync to your account.</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {themes.map((t) => {
                      const isLocked = t.plan && t.plan !== subPlan && subPlan !== "super";
                      return (
                        <button
                          key={t.id}
                          type="button"
                          disabled={isLocked}
                          onClick={() => {
                            if (isLocked) return;
                            setTheme(t.id);
                            void savePreference({ theme: t.id });
                          }}
                          className={`overflow-hidden rounded-lg border-2 text-left transition-all duration-150 ${
                            theme === t.id ? "border-brand" : "border-transparent hover:border-interactive-hover"
                          } ${isLocked ? "cursor-not-allowed opacity-50" : ""}`}
                        >
                          <div className="flex h-16">
                            {t.swatch.map((c, i) => (
                              <div key={i} className="flex-1" style={{ backgroundColor: c }} />
                            ))}
                          </div>
                          <div className="bg-bg-secondary px-3 py-2">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold">{t.label}</p>
                              {t.plan && <SubscriptionBadge plan={t.plan} />}
                              {isLocked && (
                                <span className="ml-auto text-xs text-text-muted">Locked</span>
                              )}
                            </div>
                            <p className="text-xs text-text-muted">{t.description}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {tab === "notifications" && (
                <div className="space-y-4">
                  <p className="text-sm text-text-muted">Control sounds and desktop alerts when you are away from Disband.</p>
                  <SettingRow
                    label="Message sounds"
                    description="Play a ping for @mentions and incoming DMs when the app is in the background."
                    checked={soundEnabled}
                    onChange={(next) => {
                      setSoundEnabled(next);
                      void savePreference({ sound_enabled: next });
                    }}
                  />
                  <SettingRow
                    label="Desktop notifications"
                    description="Show OS notifications for mentions, messages, and calls when Disband is not focused."
                    checked={desktopNotifications}
                    onChange={(next) => {
                      setDesktopNotifications(next);
                      void savePreference({ desktop_notifications_enabled: next });
                    }}
                  />
                  {notifPermission !== "granted" && notifPermission !== "unsupported" && (
                    <button
                      type="button"
                      onClick={() => void enableDesktopNotifications()}
                      className="flex items-center gap-2 rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
                    >
                      <IconBell size={16} />
                      Enable browser notifications
                    </button>
                  )}
                  {notifPermission === "denied" && (
                    <p className="text-xs text-text-muted">
                      Notifications are blocked in your browser. Allow them in site settings to receive desktop alerts.
                    </p>
                  )}
                  {settingsError && <p className="text-sm text-status-dnd">{settingsError}</p>}
                </div>
              )}

              {tab === "voice" && (
                <div className="space-y-4">
                  <p className="text-sm text-text-muted">
                    Choose your microphone, speaker, and camera for voice channels and calls. Device lists populate after permission is granted.
                  </p>
                  <button
                    type="button"
                    onClick={() => void testMediaAccess()}
                    className="rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
                  >
                    Allow microphone & camera
                  </button>
                  {mediaTestMessage && <p className="text-sm text-status-online">{mediaTestMessage}</p>}
                  <label className="block">
                    <span className="text-xs font-bold uppercase text-text-muted">Input device</span>
                    <select
                      value={audioInput}
                      disabled={devicesLoading}
                      onChange={(e) => {
                        setAudioInput(e.target.value);
                        setPreferredAudioInputId(e.target.value);
                      }}
                      className="mt-1 w-full rounded bg-bg-accent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand"
                    >
                      <option value="">System default</option>
                      {inputs.map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-bold uppercase text-text-muted">Output device</span>
                    <select
                      value={audioOutput}
                      disabled={devicesLoading}
                      onChange={(e) => {
                        setAudioOutput(e.target.value);
                        setPreferredAudioOutputId(e.target.value);
                      }}
                      className="mt-1 w-full rounded bg-bg-accent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand"
                    >
                      <option value="">System default</option>
                      {outputs.map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-bold uppercase text-text-muted">Camera</span>
                    <select
                      value={videoInput}
                      disabled={devicesLoading}
                      onChange={(e) => {
                        setVideoInput(e.target.value);
                        setPreferredVideoInputId(e.target.value);
                      }}
                      className="mt-1 w-full rounded bg-bg-accent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand"
                    >
                      <option value="">System default</option>
                      {cameras.map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
                      ))}
                    </select>
                  </label>
                  {settingsError && <p className="text-sm text-status-dnd">{settingsError}</p>}
                </div>
              )}

              {tab === "subscriptions" && (
                <div className="space-y-4">
                  <p className="text-sm text-text-muted">
                    Upgrade your plan for larger uploads, higher quality video, exclusive themes, and more.
                  </p>
                  <div className="rounded-lg border border-divider bg-bg-secondary p-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase text-text-muted">Current Plan</p>
                        <div className="flex items-center gap-2">
                          <span className="text-base font-bold capitalize">{subPlan}</span>
                          <SubscriptionBadge plan={subPlan as "basic" | "super" | "free"} />
                        </div>
                        {subscription?.status === "active" && (
                          <div className="space-y-0.5 pt-1">
                            {subscription.current_period_end && (
                              <p className="text-xs text-text-muted">
                                Renews {new Date(subscription.current_period_end).toLocaleDateString("en-US", {
                                  year: "numeric", month: "long", day: "numeric",
                                })}
                              </p>
                            )}
                            <p className="text-xs text-[#57f287]">Active</p>
                          </div>
                        )}
                        {subscription?.status === "past_due" && (
                          <p className="text-xs text-status-dnd">Payment failed</p>
                        )}
                        {subscription?.status === "canceled" && (
                          <p className="text-xs text-text-muted">Canceled</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => setShowSubscription(true)}
                          className="rounded bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-hover"
                        >
                          {subPlan === "free" ? "Upgrade" : "Manage"}
                        </button>
                      </div>
                    </div>
                  </div>
                  {entitlements.historyExport && (
                    <button
                      type="button"
                      onClick={exportHistory}
                      disabled={exporting}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-divider bg-bg-secondary p-4 text-sm text-text-muted hover:bg-bg-accent disabled:opacity-50"
                    >
                      <IconDownload size={16} />
                      {exporting ? "Exporting..." : "Export Message History (JSON)"}
                    </button>
                  )}
                </div>
              )}

              {tab === "textMedia" && (
                <div className="space-y-4">
                  <p className="text-sm text-text-muted">Choose how links and media appear in chat.</p>
                  <SettingRow
                    label="Link previews"
                    description="Show rich embeds with title, description, and image for URLs in messages."
                    checked={linkPreviews}
                    onChange={(next) => {
                      setLinkPreviews(next);
                      void savePreference({ link_previews_enabled: next });
                    }}
                  />
                  {settingsError && <p className="text-sm text-status-dnd">{settingsError}</p>}
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
          onSave={(crop) => void saveAvatarCrop(crop)}
        />
      )}

      <SubscriptionModal
        open={showSubscription}
        onClose={() => setShowSubscription(false)}
        userId={profile?.id}
      />
    </>
  );
}

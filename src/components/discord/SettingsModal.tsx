"use client";

import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";

import { useCallback, useEffect, useState } from "react";
import { useTheme } from "@/components/theme/ThemeProvider";
import { useApp } from "@/contexts/AppContext";
import { useMediaUpload } from "@/hooks/useMediaUpload";
import { AccentPresetGrid, ProfilePreview } from "./settings/ProfilePreview";
import {
  SettingsSection,
  SettingRow,
  Toggle,
  settingsInputClass,
  Hint,
} from "./settings/SettingsPrimitives";
import { MicTest } from "./settings/MicTest";
import { useBadges } from "@/lib/badge-store";
import { BadgeGlyph } from "@/lib/badge-icons";
import { GiftModal } from "@/components/gift/GiftModal";
import { giftUrl } from "@/lib/gifts";
import { AvatarCropModal } from "@/components/modals/AvatarCropModal";
import { Avatar } from "@/components/ui/Avatar";
import { IconClose, IconBell, IconDownload, IconUser, IconLock, IconCrown, IconGift, IconBot, IconPalette, IconImage, IconMic, IconMessage, IconBug, IconLeave, IconSearch } from "@/components/icons";
import { NewPasswordForm } from "@/components/auth/NewPasswordForm";
import { MfaSettingsPanel } from "@/components/auth/MfaSettingsPanel";
import { UsernameAvailabilityInput } from "@/components/discord/UsernameAvailabilityInput";
import { PlatformModerationPanel } from "@/components/discord/PlatformModerationPanel";
import { OfficialBroadcastPanel } from "@/components/discord/OfficialBroadcastPanel";
import { AccountRestrictionsPanel } from "@/components/discord/AccountRestrictionsPanel";
import { BotsPanel } from "./settings/BotsPanel";
import { MyReferralCard } from "@/components/referrals/MyReferralCard";
import Link from "next/link";
import { requestNotificationPermissionFromGesture } from "@/lib/notifications";
import { useAudioDevices } from "@/hooks/useAudioDevices";
import { useZoom, MIN_ZOOM, MAX_ZOOM } from "@/hooks/useZoom";
import { getStoredMotion, setStoredMotion, type MotionPreference } from "@/lib/motion";
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
import {
  STATUS_DURATION_PRESETS,
  expiresAtForDuration,
  presetForExpiresAt,
  type StatusDurationId,
} from "@/lib/presence";
import { SubscriptionBadge } from "@/components/ui/SubscriptionBadge";
import { SubscriptionModal } from "@/components/subscription/SubscriptionModal";
import { PLANS } from "@/lib/subscription";
import { useSubscription } from "@/hooks/useSubscription";
import { ThemesPanel } from "@/components/discord/settings/ThemesPanel";
import { getSupabaseClient } from "@/lib/supabase/client";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const TABS = [
  { id: "profile" as const, label: "Profile", group: "Account", icon: <IconUser size={17} />,
    description: "How you appear to everyone on Disband.",
    keywords: "avatar banner name display username bio about pronouns status note accent colour badges" },
  { id: "account" as const, label: "Account & Security", group: "Account", icon: <IconLock size={17} />,
    description: "Email, password, two-factor and account controls.",
    keywords: "email password 2fa mfa two-factor authenticator security delete export data" },
  { id: "subscriptions" as const, label: "Subscription", group: "Account", icon: <IconCrown size={17} />,
    description: "Your plan, billing and perks.",
    keywords: "aero lite plan billing upgrade gift perks premium" },
  { id: "referrals" as const, label: "Referrals", group: "Account", icon: <IconGift size={17} />,
    description: "Invite people and track what you've earned.",
    keywords: "invite referral link rewards friends" },
  { id: "bots" as const, label: "Bots", group: "Account", icon: <IconBot size={17} />,
    description: "Create and manage bots that act on your behalf.",
    keywords: "bot token api developer webhook" },
  { id: "appearance" as const, label: "Appearance", group: "App", icon: <IconPalette size={17} />,
    description: "Zoom, motion and theme mode.",
    keywords: "zoom scale size motion animation reduced dark light mode" },
  { id: "themes" as const, label: "Themes", group: "App", icon: <IconImage size={17} />,
    description: "Colour themes and skins.",
    keywords: "colour color palette skin theme dark midnight amoled" },
  { id: "notifications" as const, label: "Notifications", group: "App", icon: <IconBell size={17} />,
    description: "What reaches you, and how.",
    keywords: "sound desktop push alerts mentions ping" },
  { id: "voice" as const, label: "Voice & Video", group: "App", icon: <IconMic size={17} />,
    description: "Microphone, speakers and camera.",
    keywords: "mic microphone input output speaker headphones camera webcam test device" },
  { id: "textMedia" as const, label: "Text & Media", group: "App", icon: <IconMessage size={17} />,
    description: "Link previews, embeds and media in chat.",
    keywords: "links previews embeds images gif media unfurl" },
];

const NAV_GROUPS = ["Account", "App"] as const;

function formatBytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

const STATUSES: { id: UserStatus; label: string }[] = [
  { id: "online", label: "Online" },
  { id: "idle", label: "Away" },
  { id: "dnd", label: "Do Not Disturb" },
  { id: "offline", label: "Offline" },
];

type SettingsTab = (typeof TABS)[number]["id"];

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { theme, themes, setTheme } = useTheme();
  const { profile, user, updateProfile, updatePassword, requestPasswordReset, signOut } = useApp();

  const myBadges = useBadges(profile?.id);
  const [gifting, setGifting] = useState(false);
  const [giftLink, setGiftLink] = useState<string | null>(null);
  const [giftCopied, setGiftCopied] = useState(false);
  const { upload, isUploading } = useMediaUpload();
  const [zoom, setZoom] = useZoom();
  const [motion, setMotion] = useState<MotionPreference>(() => getStoredMotion());
  const [tab, setTab] = useState<SettingsTab>("profile");
  const [navQuery, setNavQuery] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [statusDuration, setStatusDuration] = useState<StatusDurationId>("never");
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
  const { subscription, plan: subPlan, entitlements, reload: reloadSubscription } = useSubscription(profile?.id);
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
  const [copiedId, setCopiedId] = useState(false);
  const [signingOutAll, setSigningOutAll] = useState(false);
  const [saving, setSaving] = useState(false);
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
    setPronouns(profile.pronouns ?? "");
    setStatusNote(profile.status_note ?? "");
    setStatusDuration(presetForExpiresAt(profile.status_expires_at));
    const custom = usesCustomAccent(profile);
    setUseDefaultAccent(!custom);
    setAccent1(profile.accent_color ?? DEFAULT_ACCENT);
    setAccent2(profile.accent_color_2 ?? profile.accent_color ?? "#eb459e");
    setStatus(profile.preferred_status ?? profile.status);
    setSoundEnabled(profile.sound_enabled ?? true);
    setDesktopNotifications(profile.desktop_notifications_enabled ?? true);
    setLinkPreviews(profile.link_previews_enabled ?? true);
  }, [profile]);

  // Routed through the overlay Escape stack so nested layers (avatar crop,
  // subscription) close one per press instead of all at once.
  useOverlayDismiss(onClose, open);

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

  const signOutEverywhere = useCallback(async () => {
    setSigningOutAll(true);
    setSettingsError(null);
    const { error: err } = await getSupabaseClient().auth.signOut({ scope: "others" });
    if (err) setSettingsError(err.message);
    setSigningOutAll(false);
  }, []);

  const copyUserId = useCallback(async () => {
    if (!profile?.id) return;
    try {
      await navigator.clipboard.writeText(profile.id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1500);
    } catch {
      setSettingsError("Could not copy to the clipboard.");
    }
  }, [profile?.id]);

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
    const sanitizedUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (sanitizedUsername.length < 2) {
      setError("Username must be at least 2 characters (letters, numbers, and underscores).");
      return;
    }
    if (!displayName.trim()) {
      setError("Enter a display name.");
      return;
    }
    setSaving(true);
    const err = await updateProfile({
      display_name: displayName.trim(),
      username: sanitizedUsername,
      bio: bio.trim() || null,
      pronouns: pronouns.trim() || null,
      status_note: statusNote.trim() || null,
      status_expires_at: statusNote.trim() ? expiresAtForDuration(statusDuration) : null,
      accent_color: useDefaultAccent ? null : accent1,
      accent_color_2: useDefaultAccent ? null : accent2,
      status,
    });
    setSaving(false);
    if (err) setError(err);
    else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  const profileDirty = !!profile && (
    displayName !== (profile.display_name ?? "") ||
    username !== (profile.username ?? "") ||
    bio !== (profile.bio ?? "") ||
    pronouns !== (profile.pronouns ?? "") ||
    statusNote !== (profile.status_note ?? "") ||
    statusDuration !== presetForExpiresAt(profile.status_expires_at) ||
    status !== (profile.preferred_status ?? profile.status) ||
    useDefaultAccent !== !usesCustomAccent(profile) ||
    (!useDefaultAccent &&
      (accent1 !== (profile.accent_color ?? DEFAULT_ACCENT) ||
        accent2 !== (profile.accent_color_2 ?? profile.accent_color ?? "#eb459e")))
  );

  function resetProfileEdits() {
    if (!profile) return;
    setError(null);
    setDisplayName(profile.display_name ?? "");
    setUsername(profile.username ?? "");
    setBio(profile.bio ?? "");
    setPronouns(profile.pronouns ?? "");
    setStatusNote(profile.status_note ?? "");
    setStatusDuration(presetForExpiresAt(profile.status_expires_at));
    const custom = usesCustomAccent(profile);
    setUseDefaultAccent(!custom);
    setAccent1(profile.accent_color ?? DEFAULT_ACCENT);
    setAccent2(profile.accent_color_2 ?? profile.accent_color ?? "#eb459e");
    setStatus(profile.preferred_status ?? profile.status);
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
  const navQ = navQuery.trim().toLowerCase();
  const navMatches = navQ
    ? TABS.filter((t) => `${t.label} ${t.keywords}`.toLowerCase().includes(navQ))
    : TABS;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
        <button type="button" aria-label="Close" className="absolute inset-0 bg-overlay-scrim overlay-fade" onClick={onClose} />
        {/* A fixed-size window: the old one sized itself to each page, so the
            whole dialog jumped every time you changed tabs. */}
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Settings"
          className="modal-pop relative flex h-[min(820px,calc(100vh-3rem))] w-full max-w-[1080px] overflow-hidden rounded-[22px] border border-divider bg-overlay-panel shadow-[0_40px_100px_-30px_rgba(0,0,0,0.85)]"
        >
          <nav aria-label="Settings sections" className="hidden w-[256px] shrink-0 flex-col border-r border-divider bg-bg-secondary sm:flex">
            <div className="px-3 pb-2 pt-4">
              {profile && (
                <button
                  type="button"
                  onClick={() => setTab("profile")}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-interactive-hover"
                >
                  <Avatar profile={profile} size="md" />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold leading-tight text-text-normal">
                      {profile.display_name || profile.username}
                    </span>
                    <span className="block truncate text-[12.5px] text-text-muted">Edit profile</span>
                  </span>
                </button>
              )}
              <label className="relative mt-3 block">
                <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  value={navQuery}
                  onChange={(e) => setNavQuery(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter jumps to the first match, so search-then-Enter works
                    // without touching the mouse.
                    if (e.key === "Enter" && navMatches[0]) {
                      setTab(navMatches[0].id);
                      setNavQuery("");
                    }
                  }}
                  placeholder="Search settings"
                  aria-label="Search settings"
                  className="h-9 w-full rounded-[10px] border border-divider bg-bg-accent pl-9 pr-3 text-[13.5px] text-text-normal outline-none transition-[border-color,box-shadow] placeholder:text-text-muted/80 focus:border-brand/50 focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-brand)_14%,transparent)]"
                />
              </label>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
              {navQuery.trim() && navMatches.length === 0 && (
                <p className="px-2 py-3 text-[13px] text-text-muted">No settings match “{navQuery.trim()}”.</p>
              )}
              {NAV_GROUPS.map((group) => {
                const items = navMatches.filter((t) => t.group === group);
                if (items.length === 0) return null;
                return (
                  <div key={group} className="mt-3 first:mt-1">
                    <h2 className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted/80">
                      {group}
                    </h2>
                    {items.map((t) => {
                      const active = tab === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          aria-current={active ? "page" : undefined}
                          onClick={() => {
                            setTab(t.id);
                            setNavQuery("");
                          }}
                          className={`relative mb-px flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left text-[14px] transition-colors duration-150 ${
                            active
                              ? "bg-interactive-selected font-medium text-text-normal"
                              : "text-text-muted hover:bg-interactive-hover hover:text-text-normal"
                          }`}
                        >
                          {active && <span aria-hidden className="absolute -left-3 top-2 bottom-2 w-[3px] rounded-r-full bg-brand" />}
                          <span className={active ? "text-text-normal" : "text-text-muted"}>{t.icon}</span>
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            <div className="border-t border-divider p-3">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  window.location.href = "/bug-report";
                }}
                className="flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left text-[14px] text-text-muted transition-colors hover:bg-interactive-hover hover:text-text-normal"
              >
                <IconBug size={17} />
                Report a bug
              </button>
              <button
                type="button"
                onClick={() => void signOut()}
                className="flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left text-[14px] text-status-dnd transition-colors hover:bg-status-dnd/10"
              >
                <IconLeave size={17} />
                Log out
              </button>
            </div>
          </nav>

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex items-start justify-between gap-4 px-8 pb-4 pt-6">
              <div className="min-w-0">
                <select
                  value={tab}
                  onChange={(e) => setTab(e.target.value as SettingsTab)}
                  aria-label="Settings section"
                  className="w-full rounded-[10px] border border-divider bg-bg-accent px-2 py-1.5 text-lg font-semibold outline-none focus:border-brand/50 sm:hidden"
                >
                  {TABS.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
                <h1 className="hidden text-[22px] font-semibold tracking-[-0.02em] text-text-normal sm:block">
                  {activeTab?.label ?? "Settings"}
                </h1>
                {activeTab?.description && (
                  <p className="mt-1 hidden text-[14px] text-text-muted sm:block">{activeTab.description}</p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close settings"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-divider text-text-muted transition-colors hover:bg-interactive-hover hover:text-text-normal"
                >
                  <IconClose size={17} />
                </button>
                <span aria-hidden className="hidden text-[10.5px] font-medium uppercase tracking-wide text-text-muted/70 sm:block">Esc</span>
              </div>
            </header>

            <div key={tab} className="view-enter flex-1 overflow-y-auto px-8 pb-8 pt-2">
              <div className="max-w-[720px]">
              {tab === "profile" && (
                <div className="pb-20">
                  {profile && (
                    <div className="mb-6">
                      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-text-muted">
                        Preview
                      </p>
                      <ProfilePreview

                        profile={{
                          ...profile,
                          display_name: displayName,
                          username,
                          bio,
                          accent_color: useDefaultAccent ? null : accent1,
                          accent_color_2: useDefaultAccent ? null : accent2,
                        }}
                        displayName={displayName}
                        username={username}
                        bio={bio}
                        status={status}

                        onChangeAvatar={pickAvatar}
                        onChangeBanner={(file) => void handleBanner(file)}
                      />
                    </div>
                  )}

                  <SettingsSection
                    title="Identity"
                    description="How your name appears across Disband."
                  >
                    <SettingRow label="Display name" htmlFor="settings-display-name" stacked>
                      <input
                        id="settings-display-name"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value.slice(0, 25))}
                        maxLength={25}
                        className={settingsInputClass}
                      />
                    </SettingRow>

                    <SettingRow
                      label="Username"
                      description="Lowercase letters, numbers, and underscores. Others use this to add you."
                      stacked
                    >
                      <UsernameAvailabilityInput
                        value={username}
                        onChange={setUsername}
                        currentUsername={profile?.username}
                      />
                    </SettingRow>

                    <SettingRow
                      label="About me"
                      description="Line breaks are allowed."
                      htmlFor="settings-bio"
                      stacked
                    >
                      <textarea
                        id="settings-bio"
                        value={bio}
                        onChange={(e) => setBio(e.target.value.slice(0, entitlements.maxBioLength))}
                        rows={3}
                        maxLength={entitlements.maxBioLength}
                        placeholder="Tell people about yourself."
                        className={`${settingsInputClass} resize-none`}
                      />
                      <p className="mt-1 text-right text-[12px] text-text-muted">
                        {bio.length}/{entitlements.maxBioLength}
                        {subPlan === "free" && (
                          <>
                            {" · "}
                            <button
                              type="button"
                              onClick={() => setTab("subscriptions")}
                              className="underline hover:text-text-normal"
                            >
                              more with a paid plan
                            </button>
                          </>
                        )}
                      </p>
                    </SettingRow>

                    <SettingRow label="Pronouns" stacked htmlFor="settings-pronouns">
                      <input
                        id="settings-pronouns"
                        value={pronouns}
                        onChange={(e) => setPronouns(e.target.value.slice(0, 40))}
                        maxLength={40}
                        placeholder="e.g. she/her, they/them"
                        className={settingsInputClass}
                      />
                    </SettingRow>

                    <SettingRow
                      label="Status note"
                      description="Shown under your profile picture — e.g. a tiny note about what you're up to."
                      stacked
                      htmlFor="settings-status-note"
                    >
                      <textarea
                        id="settings-status-note"
                        value={statusNote}
                        onChange={(e) => setStatusNote(e.target.value.slice(0, 60))}
                        rows={2}
                        maxLength={60}
                        placeholder="e.g. low-key lurking"
                        className={`${settingsInputClass} resize-none`}
                      />
                      <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Clear status after">
                        <span className="mr-1 text-[12px] text-text-muted">Clear after:</span>
                        {STATUS_DURATION_PRESETS.map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => setStatusDuration(preset.id)}
                            aria-pressed={statusDuration === preset.id}
                            className={`rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors ${
                              statusDuration === preset.id
                                ? "bg-brand text-white"
                                : "bg-bg-tertiary text-text-muted hover:bg-interactive-hover hover:text-text-normal"
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </SettingRow>
                  </SettingsSection>

                  <p className="mb-6 -mt-2 text-[12px] text-text-muted">
                    Hover your avatar or banner in the preview to change them.{" "}
                    {subPlan === "free"
                      ? "Animated avatars need a paid plan."
                      : "GIFs are supported for animated avatars on your plan."}
                  </p>

                  <SettingsSection
                    title="Profile colour"
                    description="Pick a preset, or set two colours yourself — the same colour twice gives a solid, two different colours give a gradient."
                    action={
                      !useDefaultAccent ? (
                        <button
                          type="button"
                          onClick={() => setUseDefaultAccent(true)}
                          className="rounded-md border border-divider px-2.5 py-1 text-[12px] transition-colors hover:bg-interactive-hover"
                        >
                          Reset to default
                        </button>
                      ) : undefined
                    }
                  >
                    <SettingRow label="Presets" stacked>
                      <AccentPresetGrid
                        active={useDefaultAccent ? null : { from: accent1, to: accent2 }}
                        onPick={(from, to) => {
                          setUseDefaultAccent(false);
                          setAccent1(from);
                          setAccent2(to);
                        }}
                      />
                    </SettingRow>

                    <SettingRow
                      label="Custom colours"
                      description={
                        useDefaultAccent
                          ? "Currently using the default style."
                          : isProfileGradient(previewAccent)
                            ? "Gradient"
                            : "Solid colour"
                      }
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          aria-label="Colour 1"
                          value={accent1}
                          onChange={(e) => {
                            setUseDefaultAccent(false);
                            setAccent1(e.target.value);
                          }}
                          className="h-9 w-12 cursor-pointer rounded bg-bg-tertiary"
                        />
                        <input
                          type="color"
                          aria-label="Colour 2"
                          value={accent2}
                          onChange={(e) => {
                            setUseDefaultAccent(false);
                            setAccent2(e.target.value);
                          }}
                          className="h-9 w-12 cursor-pointer rounded bg-bg-tertiary"
                        />
                      </div>
                    </SettingRow>

                    <SettingRow label="Sidebar preview" stacked>
                      <div
                        className="overflow-hidden rounded-lg p-3"
                        style={getProfilePanelStyle(previewAccent)}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-bold ring-2 ring-black/15"
                            style={getAvatarStyle(previewAccent)}
                          >
                            {(displayName || username || "?").charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-[15px] font-semibold leading-tight">
                              {displayName.trim() || username || "Display name"}
                            </p>
                            {username && (
                              <p
                                className="truncate text-[13px]"
                                style={{ color: getProfilePanelMutedColor(previewAccent) }}
                              >
                                @{username}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </SettingRow>
                  </SettingsSection>

                  <SettingsSection
                    title="Status"
                    description="Sets how you appear to everyone else."
                  >
                    <SettingRow label="Online status" stacked>
                      <div className="flex flex-wrap gap-2">
                        {STATUSES.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setStatus(s.id)}
                            aria-pressed={status === s.id}
                            className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
                              status === s.id
                                ? "bg-brand text-white"
                                : "bg-bg-tertiary text-text-muted hover:text-text-normal"
                            }`}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </SettingRow>
                  </SettingsSection>

                  {myBadges.length > 0 && (
                    <SettingsSection
                      title="Badges"
                      description="Awarded by Disband — these can't be changed from here."
                    >
                      <SettingRow label="Your badges" stacked>
                        <div className="flex flex-wrap gap-2">
                          {myBadges.map((b) => (
                            <span
                              key={b.key}
                              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-semibold"
                              style={{ backgroundColor: `${b.accent}2e`, color: b.accent }}
                              title={b.description}
                            >
                              <BadgeGlyph badgeKey={b.key} size={14} />
                              {b.name}
                            </span>
                          ))}
                        </div>
                      </SettingRow>
                    </SettingsSection>
                  )}

                  {error && <p className="text-sm text-status-dnd">{error}</p>}

                  {(profileDirty || saving || saved) && (
                    <div className="sticky bottom-0 -mx-8 mt-8 flex items-center justify-end gap-3 border-t border-divider bg-overlay-panel/95 px-8 py-3 backdrop-blur">
                      <button
                        type="button"
                        onClick={resetProfileEdits}
                        disabled={!profileDirty || saving}
                        className="rounded-md border border-divider px-4 py-2 text-sm font-semibold text-text-normal transition-colors hover:bg-interactive-hover disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Revert
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveProfile()}
                        disabled={saving || !profileDirty}
                        className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {saving ? "Saving…" : profileDirty ? "Save Changes" : "Saved!"}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {tab === "account" && (
                <div className="pb-20">
                  <SettingsSection
                    title="Account"
                    description="Your email and user identifier on Disband."
                  >
                    <SettingRow label="Email" stacked>
                      <p className="text-[14px] text-text-normal">{user?.email ?? "Not available"}</p>
                    </SettingRow>
                    <SettingRow
                      label="User ID"
                      description="Used for support requests. You can't change this."
                      stacked
                    >
                      <div className="flex items-center gap-2">
                        <code className="min-w-0 flex-1 truncate rounded-md border border-divider bg-bg-tertiary px-3 py-2 text-[12.5px] text-text-muted">
                          {profile?.id}
                        </code>
                        <button
                          type="button"
                          onClick={() => void copyUserId()}
                          className="shrink-0 rounded-md border border-divider px-3 py-2 text-[13px] font-semibold text-text-normal transition-colors hover:bg-interactive-hover"
                        >
                          {copiedId ? "Copied" : "Copy"}
                        </button>
                      </div>
                    </SettingRow>
                  </SettingsSection>

                  <SettingsSection
                    title="Password & security"
                    description="Keep your account protected."
                  >
                    <SettingRow
                      label="Change password"
                      description="Set a new password while you are logged in."
                      stacked
                    >
                      <NewPasswordForm submitLabel="Update password" onSubmit={updatePassword} />
                    </SettingRow>
                    {user?.email && (
                      <SettingRow
                        label="Email reset link"
                        description={`Prefer to reset from your inbox? We can send a link to ${user.email}.`}
                        stacked
                      >
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
                          className="rounded-md border border-divider px-3 py-1.5 text-[13px] font-semibold transition-colors hover:bg-interactive-hover"
                        >
                          Send reset email
                        </button>
                        {resetEmailSent && (
                          <p className="mt-2 text-[13px] text-status-online">Reset link sent. Check your inbox.</p>
                        )}
                      </SettingRow>
                    )}
                  </SettingsSection>

                  <div className="mb-8">
                    <MfaSettingsPanel />
                  </div>

                  <SettingsSection
                    title="Sessions"
                    description="Manage where your account is signed in."
                  >
                    <SettingRow
                      label="Sign out everywhere"
                      description="Ends every other session on this account. You'll stay signed in here."
                    >
                      <button
                        type="button"
                        onClick={() => void signOutEverywhere()}
                        disabled={signingOutAll}
                        className="rounded-md border border-status-dnd/40 px-3 py-1.5 text-[13px] font-semibold text-status-dnd transition-colors hover:bg-status-dnd/10 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {signingOutAll ? "Signing out…" : "Sign out everywhere"}
                      </button>
                    </SettingRow>
                  </SettingsSection>

                  <PlatformModerationPanel />

                  <AccountRestrictionsPanel />

                  <OfficialBroadcastPanel />

                  {settingsError && <p className="text-sm text-status-dnd">{settingsError}</p>}
                </div>
              )}

              {tab === "appearance" && (
                <div>
                  <SettingsSection title="Interface zoom" description="Scales the whole app. Ctrl/Cmd + and − work anywhere, and Ctrl/Cmd 0 resets.">
                    <div className="flex items-center gap-3 px-5 py-4">
                      <button
                        type="button"
                        onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 0.1))}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-divider text-lg text-text-normal transition-colors hover:bg-interactive-hover"
                        aria-label="Zoom out"
                      >
                        −
                      </button>
                      <input
                        type="range"
                        min={MIN_ZOOM}
                        max={MAX_ZOOM}
                        step={0.05}
                        value={zoom}
                        onChange={(e) => setZoom(Number.parseFloat(e.target.value))}
                        className="flex-1 accent-brand"
                        aria-label="Interface zoom"
                      />
                      <button
                        type="button"
                        onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 0.1))}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-divider text-lg text-text-normal transition-colors hover:bg-interactive-hover"
                        aria-label="Zoom in"
                      >
                        +
                      </button>
                      <span className="w-12 shrink-0 text-right text-[13.5px] tabular-nums text-text-muted">
                        {Math.round(zoom * 100)}%
                      </span>
                    </div>
                  </SettingsSection>

                  <SettingsSection title="Motion" description="Message arrivals, view transitions, badges and ambient effects.">
                    <div className="px-5 py-4">
                      <div className="flex gap-1 rounded-[12px] border border-divider bg-bg-accent p-1" role="group" aria-label="Animation preference">
                        {(
                          [
                            { id: "system", label: "System", hint: "Follow your OS setting" },
                            { id: "full", label: "Full", hint: "Always animate" },
                            { id: "reduced", label: "Reduced", hint: "Calm interface" },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            title={opt.hint}
                            aria-pressed={motion === opt.id}
                            onClick={() => {
                              setMotion(opt.id);
                              setStoredMotion(opt.id);
                            }}
                            className={`flex-1 rounded-[9px] px-3 py-1.5 text-[13.5px] font-medium transition-colors ${
                              motion === opt.id
                                ? "bg-interactive-selected text-text-normal shadow-[0_1px_2px_rgba(0,0,0,0.3)]"
                                : "text-text-muted hover:text-text-normal"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </SettingsSection>

                  <section>
                    <div className="mb-3">
                      <h3 className="text-[14.5px] font-semibold text-text-normal">Theme</h3>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-text-muted">
                        Applies instantly and syncs to your account.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {themes.map((t) => {
                        const isLocked = !!t.plan && subPlan === "free";
                        const selected = theme === t.id;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            disabled={isLocked}
                            aria-pressed={selected}
                            onClick={() => {
                              if (isLocked) return;
                              setTheme(t.id);
                              void savePreference({ theme: t.id });
                            }}
                            className={`overflow-hidden rounded-2xl border text-left transition-[border-color,box-shadow] duration-150 ${
                              selected
                                ? "border-brand shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-brand)_18%,transparent)]"
                                : "border-divider hover:border-text-muted/40"
                            } ${isLocked ? "cursor-not-allowed opacity-50" : ""}`}
                          >
                            <div className="flex h-14">
                              {t.swatch.map((c, i) => (
                                <div key={i} className="flex-1" style={{ backgroundColor: c }} />
                              ))}
                            </div>
                            <div className="border-t border-divider bg-bg-secondary px-4 py-3">
                              <div className="flex items-center gap-2">
                                <p className="text-[14px] font-medium">{t.label}</p>
                                {t.plan && <SubscriptionBadge plan={t.plan} />}
                                {isLocked ? (
                                  <span className="ml-auto text-[12px] text-text-muted">Locked</span>
                                ) : selected ? (
                                  <span className="ml-auto text-[12px] font-medium text-brand">Active</span>
                                ) : null}
                              </div>
                              <p className="mt-0.5 text-[12.5px] text-text-muted">{t.description}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                </div>
              )}

              {tab === "themes" && <ThemesPanel />}

              {tab === "notifications" && (
                <div>
                  <SettingsSection title="Alerts" description="Sounds and desktop alerts for when you're away from Disband.">
                  <SettingRow
                    label="Message sounds"
                    description="Play a ping for @mentions and incoming DMs when the app is in the background."
                  >
                    <Toggle
                      checked={soundEnabled}
                      onChange={(next) => {
                        setSoundEnabled(next);
                        void savePreference({ sound_enabled: next });
                      }}
                      label="Message sounds"
                    />
                  </SettingRow>
                  <SettingRow
                    label="Desktop notifications"
                    description="Show OS notifications for mentions, messages, and calls when Disband is not focused."
                  >
                    <Toggle
                      checked={desktopNotifications}
                      onChange={(next) => {
                        setDesktopNotifications(next);
                        void savePreference({ desktop_notifications_enabled: next });
                      }}
                      label="Desktop notifications"
                    />
                  </SettingRow>
                  {notifPermission !== "granted" && notifPermission !== "unsupported" && (
                    <SettingRow
                      label="Browser permission"
                      description={
                        notifPermission === "denied"
                          ? "Blocked in your browser. Allow notifications in this site's settings, then come back."
                          : "Your browser needs to allow Disband to show alerts."
                      }
                    >
                      {notifPermission !== "denied" && (
                        <button
                          type="button"
                          onClick={() => void enableDesktopNotifications()}
                          className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-brand px-3.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-brand-hover"
                        >
                          <IconBell size={15} />
                          Allow
                        </button>
                      )}
                    </SettingRow>
                  )}
                  </SettingsSection>
                  {settingsError && <p className="text-sm text-status-dnd">{settingsError}</p>}
                </div>
              )}

              {tab === "voice" && (
                <div className="space-y-6">
                  <SettingsSection
                    title="Devices"
                    description="Choose your microphone, speaker, and camera for voice channels and calls. Device lists populate after permission is granted."
                  >
                    <SettingRow label="Input device" stacked>
                      <select
                        value={audioInput}
                        disabled={devicesLoading}
                        onChange={(e) => {
                          setAudioInput(e.target.value);
                          setPreferredAudioInputId(e.target.value);
                        }}
                        className={settingsInputClass}
                      >
                        <option value="">System default</option>
                        {inputs.map((device) => (
                          <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
                        ))}
                      </select>
                    </SettingRow>
                    <SettingRow label="Output device" stacked>
                      <select
                        value={audioOutput}
                        disabled={devicesLoading}
                        onChange={(e) => {
                          setAudioOutput(e.target.value);
                          setPreferredAudioOutputId(e.target.value);
                        }}
                        className={settingsInputClass}
                      >
                        <option value="">System default</option>
                        {outputs.map((device) => (
                          <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
                        ))}
                      </select>
                    </SettingRow>
                    <SettingRow label="Camera" stacked>
                      <select
                        value={videoInput}
                        disabled={devicesLoading}
                        onChange={(e) => {
                          setVideoInput(e.target.value);
                          setPreferredVideoInputId(e.target.value);
                        }}
                        className={settingsInputClass}
                      >
                        <option value="">System default</option>
                        {cameras.map((device) => (
                          <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
                        ))}
                      </select>
                    </SettingRow>
                  </SettingsSection>

                  <SettingsSection
                    title="Microphone test"
                    description="Confirm your microphone hears you before joining a call."
                  >
                    <SettingRow
                      label="Live input level"
                      description="Speak and watch the meter move."
                      stacked
                    >
                      <MicTest deviceId={audioInput} />
                    </SettingRow>
                  </SettingsSection>

                  <SettingsSection
                    title="Access"
                    description="Grant permission once so devices can be listed and tested."
                  >
                    <SettingRow label="Microphone & camera access">
                      <button
                        type="button"
                        onClick={() => void testMediaAccess()}
                        className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
                      >
                        Allow microphone & camera
                      </button>
                    </SettingRow>
                  </SettingsSection>

                  {mediaTestMessage && <p className="text-sm text-status-online">{mediaTestMessage}</p>}
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
                          <SubscriptionBadge plan={subPlan} />
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
                            <Hint tone="online">Active</Hint>
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
                  <div className="rounded-lg border border-divider bg-bg-secondary p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-bold text-text-normal">Gift a subscription</p>
                        <p className="text-xs text-text-muted">
                          Pay once for Aero or Lite. Send the link in a DM or a channel — first to claim it gets it.
                        </p>
                        {giftLink && (
                          <div className="flex items-center gap-2 pt-1">
                            <code className="min-w-0 flex-1 truncate rounded bg-bg-tertiary px-2 py-1 text-xs text-text-normal">
                              {giftLink}
                            </code>
                            <button
                              type="button"
                              onClick={() => {
                                void navigator.clipboard?.writeText(giftLink).then(
                                  () => setGiftCopied(true),
                                  () => setGiftCopied(false),
                                );
                                window.setTimeout(() => setGiftCopied(false), 2000);
                              }}
                              className="shrink-0 rounded border border-divider px-2 py-1 text-xs font-semibold text-text-normal hover:bg-interactive-hover"
                            >
                              {giftCopied ? "Copied" : "Copy"}
                            </button>
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => { setGiftCopied(false); setGifting(true); }}
                        className="shrink-0 rounded bg-[#fee75c] px-3 py-1.5 text-sm font-bold text-black transition-opacity hover:opacity-90"
                      >
                        Gift
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void reloadSubscription()}
                    className="text-xs text-text-muted hover:text-text-normal underline underline-offset-2"
                  >
                    Refresh subscription
                  </button>

                  <SettingsSection
                    title="What your plan includes"
                    description="Limits that apply to your account right now."
                  >
                    <SettingRow label="Max file upload">
                      <span className="text-[13px] font-semibold text-text-normal">
                        {formatBytes(entitlements.maxUploadBytes)}
                      </span>
                    </SettingRow>
                    <SettingRow label="Video quality">
                      <span className="text-[13px] font-semibold text-text-normal">
                        {entitlements.videoQuality}
                      </span>
                    </SettingRow>
                    <SettingRow label="Animated avatar">
                      <span className="text-[13px] font-semibold text-text-normal">
                        {entitlements.animatedAvatar ? "Included" : "—"}
                      </span>
                    </SettingRow>
                  </SettingsSection>
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

              {tab === "referrals" && (
                <div className="space-y-4">
                  <p className="text-sm text-text-muted">
                    Share your code and earn when friends join with it.
                  </p>
                  <MyReferralCard />
                  <div className="flex flex-col gap-1.5 rounded-lg border border-divider bg-bg-secondary p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[13px] font-medium text-text-normal">Live leaderboard</p>
                      <p className="mt-0.5 text-[12px] text-text-muted">
                        See who's verified the most referrals — the December winner takes home a $100
                        Visa card.
                      </p>
                    </div>
                    <Link
                      href="/leaderboards/referrals"
                      className="inline-flex shrink-0 items-center justify-center rounded-md bg-brand px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-brand-hover"
                    >
                      View leaderboard
                    </Link>
                  </div>
                </div>
              )}

              {tab === "bots" && <BotsPanel />}

              {tab === "textMedia" && (
                <div>
                  <SettingsSection title="Links" description="How links appear in conversations.">
                  <SettingRow
                    label="Link previews"
                    description="Show rich embeds with title, description, and image for URLs in messages."
                  >
                    <Toggle
                      checked={linkPreviews}
                      onChange={(next) => {
                        setLinkPreviews(next);
                        void savePreference({ link_previews_enabled: next });
                      }}
                      label="Link previews"
                    />
                  </SettingRow>
                  </SettingsSection>
                  {settingsError && <p className="text-sm text-status-dnd">{settingsError}</p>}
                </div>
              )}
              </div>
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

      {gifting && (
        <GiftModal
          onClose={() => setGifting(false)}
          onPurchased={(code) => {
            setGiftLink(giftUrl(code, window.location.origin));
            setGifting(false);
          }}
        />
      )}
    </>
  );
}

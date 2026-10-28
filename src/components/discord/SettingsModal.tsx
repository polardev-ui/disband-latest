"use client";

import { Tooltip } from "./Tooltip";
import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
import { usePresence } from "@/hooks/usePresence";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/theme/ThemeProvider";
import { useApp } from "@/contexts/AppContext";
import { useI18n } from "@/contexts/I18nContext";
import { LANGUAGES, languageFor } from "@/lib/i18n";
import { useMediaUpload } from "@/hooks/useMediaUpload";
import { AccentPresetGrid, ProfilePreview } from "./settings/ProfilePreview";
import { GuildTagPicker } from "./settings/GuildTagPicker";
import {
  SettingsSection,
  SettingRow,
  Toggle,
  settingsInputClass,
  Hint,
} from "./settings/SettingsPrimitives";
import { MicTest } from "./settings/MicTest";
import { SettingsLayer, SettingsNavHeader, SettingsNavItem, SettingsNavSeparator } from "@/components/ui/SettingsLayer";
import { ClassicModal, classicBtn } from "@/components/ui/ClassicModal";
import { MyAccountPanel } from "./settings/MyAccountPanel";
import { isNoiseCancellationEnabled, setNoiseCancellationEnabled, getNoiseCancellationStrength, setNoiseCancellationStrength, getNoiseSuppressionMode, setNoiseSuppressionMode, type NoiseSuppressionMode } from "@/lib/audio-settings";
import { loadAllBadgesForUser, setBadgeVisible } from "@/lib/badge-store";
import type { AwardedBadge } from "@/lib/badge-store";
import {
  clearLastfmPending,
  disconnectSpotify,
  exchangeSpotifyCode,
  getSpotifyConnection,
  hasLegacySpotifyConnection,
  importLegacySpotifyConnection,
  fetchLastfmSession,
  lastfmConfigured,
  readLastfmPending,
  readLastfmUsername,
  spotifyConnectUrl,
  spotifyClientId,
  writeLastfmUsername,
} from "@/lib/music-presence";
import { isTauri } from "@/lib/platform";
import { BadgeGlyph } from "@/lib/badge-icons";
import { GiftModal } from "@/components/gift/GiftModal";
import { GIFT_PLAN_NAME, giftUrl, monthsLabel, type GiftPlan } from "@/lib/gifts";
import { apiFetch } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { IconClose, IconBell, IconDownload, IconUser, IconLock, IconCrown, IconGift, IconBot, IconPalette, IconImage, IconMic, IconMessage, IconBug, IconLeave, IconSearch, IconMusic, IconLanguage, IconCheck, IconExternalLink } from "@/components/icons";
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
import { NAME_FONT_OPTIONS, isNameFontAvailable, NAME_FONT_CLASS, type NameFontId } from "@/lib/nameFonts";
import type { UserStatus, Profile } from "@/lib/supabase/types";
import {
  STATUS_DURATION_PRESETS,
  expiresAtForDuration,
  presetForExpiresAt,
  type StatusDurationId,
} from "@/lib/presence";
import { SubscriptionBadge } from "@/components/ui/SubscriptionBadge";
import { SubscriptionModal } from "@/components/subscription/SubscriptionModal";
import { ConfirmDialog } from "@/components/modals/server-settings/ui";
import { PLANS } from "@/lib/subscription";
import { useSubscription } from "@/hooks/useSubscription";
import { ThemesPanel } from "@/components/discord/settings/ThemesPanel";
import { getSupabaseClient } from "@/lib/supabase/client";
import { alertDialog } from "@/lib/dialogs";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: SettingsTab;
}

const TABS = [
  { id: "account" as const, label: "My Account", group: "Account", icon: <IconLock size={17} />,
    description: "Email, password, two-factor and account controls.",
    keywords: "email password 2fa mfa two-factor authenticator passkey security delete export data" },
  { id: "profile" as const, label: "Profiles", group: "Account", icon: <IconUser size={17} />,
    description: "How you appear to everyone on Disband.",
    keywords: "avatar banner name display username bio about pronouns status note accent colour badges" },
  { id: "connections" as const, label: "Connections", group: "Account", icon: <IconMusic size={17} />,
    description: "Spotify and SoundCloud — show what you're listening to.",
    keywords: "spotify soundcloud lastfm music listening currently playing connect integrate account" },
  { id: "bots" as const, label: "Bots", group: "Account", icon: <IconBot size={17} />,
    description: "Create and manage bots that act on your behalf.",
    keywords: "bot token api developer webhook" },
  { id: "subscriptions" as const, label: "Subscription", group: "Billing", icon: <IconCrown size={17} />,
    description: "Your plan, billing and perks.",
    keywords: "aero lite plan billing upgrade gift perks premium" },
  { id: "referrals" as const, label: "Referrals", group: "Billing", icon: <IconGift size={17} />,
    description: "Invite people and track what you've earned.",
    keywords: "invite referral link rewards friends" },
  { id: "appearance" as const, label: "Appearance", group: "App", icon: <IconPalette size={17} />,
    description: "Zoom, motion and theme mode.",
    keywords: "zoom scale size motion animation reduced dark light mode" },
  { id: "language" as const, label: "Language", group: "App", icon: <IconLanguage size={17} />,
    description: "Interface language and translations.",
    keywords: "language locale translation english spanish french german portuguese japanese korean chinese" },
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

const NAV_GROUPS = ["Account", "Billing", "App"] as const;
const NAV_GROUP_LABEL: Record<(typeof NAV_GROUPS)[number], string> = {
  Account: "User Settings",
  Billing: "Billing Settings",
  App: "App Settings",
};

function formatBytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

const STATUSES: { id: UserStatus; label: string }[] = [
  { id: "online", label: "Online" },
  { id: "idle", label: "Away" },
  { id: "dnd", label: "Do Not Disturb" },
  { id: "offline", label: "Offline" },
];

export type SettingsTab = (typeof TABS)[number]["id"];

interface GiftRowSummary {
  code: string;
  plan: GiftPlan;
  months: number;
  status: string;
  claimedAt: string | null;
  expiresAt: string | null;
}

interface MyGifts {
  sent: GiftRowSummary[];
  received: GiftRowSummary[];
}

function normalizeGift(raw: Record<string, unknown>): GiftRowSummary {
  return {
    code: typeof raw.code === "string" ? raw.code : "",
    plan: raw.plan === "lite" ? "lite" : "aero",
    months: typeof raw.months === "number" ? raw.months : 1,
    status: typeof raw.status === "string" ? raw.status : "pending",
    claimedAt: typeof raw.claimed_at === "string" ? raw.claimed_at : null,
    expiresAt: typeof raw.expires_at === "string" ? raw.expires_at : null,
  };
}

function giftStatusLine(g: GiftRowSummary, received = false): string {
  if (received || g.status === "claimed") {
    const when = g.claimedAt ? ` on ${new Date(g.claimedAt).toLocaleDateString()}` : "";
    return received ? `Claimed by you${when}` : `Claimed${when}`;
  }
  switch (g.status) {
    case "unclaimed":
      return g.expiresAt
        ? `Unclaimed · expires ${new Date(g.expiresAt).toLocaleDateString()}`
        : "Unclaimed";
    case "pending":
      return "Waiting for payment to clear";
    case "refunded":
      return "Refunded";
    case "expired":
      return "Expired";
    default:
      return g.status;
  }
}

export function SettingsModal({ open, onClose, initialTab }: SettingsModalProps) {
  const { theme, themes, setTheme } = useTheme();
  const { t, language, setLanguage } = useI18n();
  const { profile, user, updateProfile, signOut, requestAccountDeletion } = useApp();
  const isAnonymous = profile?.account_type === "anonymous";

  const [myAllBadges, setMyAllBadges] = useState<Array<AwardedBadge & { visible: boolean }>>([]);
  const [badgeError, setBadgeError] = useState<string | null>(null);
  useEffect(() => {
    if (!profile?.id) { setMyAllBadges([]); return; }
    let cancelled = false;
    void loadAllBadgesForUser(profile.id).then((badges) => { if (!cancelled) setMyAllBadges(badges); });
    return () => { cancelled = true; };
  }, [profile?.id]);
  const [gifting, setGifting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);
  const { mounted: giftMounted, exiting: giftExiting } = usePresence(gifting);
  const [giftLink, setGiftLink] = useState<string | null>(null);
  const [giftCopied, setGiftCopied] = useState(false);
  const [myGifts, setMyGifts] = useState<MyGifts | null>(null);
  const [copiedGiftCode, setCopiedGiftCode] = useState<string | null>(null);
  const loadMyGifts = useCallback(async () => {
    try {
      const res = await apiFetch("/api/gifts/mine");
      if (!res.ok) return;
      const data = (await res.json()) as { sent?: unknown[]; received?: unknown[] };
      setMyGifts({
        sent: (data.sent ?? []).map((r) => normalizeGift(r as Record<string, unknown>)),
        received: (data.received ?? []).map((r) => normalizeGift(r as Record<string, unknown>)),
      });
    } catch {
      // The card stays hidden; there is nothing for the user to fix here.
    }
  }, []);
  const { upload, isUploading } = useMediaUpload();
  const [zoom, setZoom] = useZoom();
  const [motion, setMotion] = useState<MotionPreference>(() => getStoredMotion());
  const [tab, setTab] = useState<SettingsTab>("account");
  useEffect(() => {
    if (open && initialTab) setTab(initialTab);
  }, [open, initialTab]);
  useEffect(() => {
    if (!open || tab !== "subscriptions" || !profile?.id) return;
    void loadMyGifts();
  }, [open, tab, profile?.id, loadMyGifts]);
  const [navQuery, setNavQuery] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [nameFont, setNameFont] = useState<string>("default");
  const [nameColor, setNameColor] = useState<string>("");
  const [nameColor2, setNameColor2] = useState<string>("");
  const [nameGradientDir, setNameGradientDir] = useState<string>("135deg");
  const [statusDuration, setStatusDuration] = useState<StatusDurationId>("never");
  const [accent1, setAccent1] = useState(DEFAULT_ACCENT);
  const [accent2, setAccent2] = useState("#eb459e");
  const [useDefaultAccent, setUseDefaultAccent] = useState(true);
  const [status, setStatus] = useState<UserStatus>("online");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Instant local previews for avatar/banner: the picked file shows in the
  // preview card immediately, while the upload + profile write happen
  // quietly in the background. Cleared once the real URL lands.
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [removeBanner, setRemoveBanner] = useState(false);
  const [pendingBannerFile, setPendingBannerFile] = useState<File | null>(null);
  const previewUrlsRef = useRef<{ avatar: string | null; banner: string | null }>({ avatar: null, banner: null });
  useEffect(() => {
    const leftovers = previewUrlsRef.current;
    return () => {
      if (leftovers.avatar) URL.revokeObjectURL(leftovers.avatar);
      if (leftovers.banner) URL.revokeObjectURL(leftovers.banner);
    };
  }, []);
  const [showSubscription, setShowSubscription] = useState(false);
  const {
    subscription,
    plan: subPlan,
    entitlements,
    reload: reloadSubscription,
    cancelSubscription,
  } = useSubscription(profile?.id);
  const [billingDialog, setBillingDialog] = useState<"cancel" | "resume" | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const cancellationScheduled = subscription?.cancel_at_period_end === true;
  const stripeManageable = !!subscription?.stripe_subscription_id && subscription.provider !== "apple";
  const canCancelStripe = stripeManageable && !!subscription
    && ["active", "trialing", "past_due"].includes(subscription.status);
  const billingPeriodEndLabel = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString("en-GB", {
        year: "numeric", month: "long", day: "numeric",
      })
    : "the end of the current billing period";
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [desktopNotifications, setDesktopNotifications] = useState(true);
  const [linkPreviews, setLinkPreviews] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">("default");
  const [audioInput, setAudioInput] = useState("");
  const [noiseCancellation, setNoiseCancellationState] = useState(isNoiseCancellationEnabled());
  const [noiseCancellationStrength, setNoiseCancellationStrengthState] = useState(getNoiseCancellationStrength());
  const [noiseMode, setNoiseModeState] = useState<NoiseSuppressionMode>(getNoiseSuppressionMode());
  const [audioOutput, setAudioOutput] = useState("");
  const [videoInput, setVideoInput] = useState("");
  const [mediaTestMessage, setMediaTestMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  // Connections tab: Spotify tokens live server-side (see music-presence
  // lib); Last.fm is a username lookup and carries SoundCloud scrobbles.
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [spotifyChecking, setSpotifyChecking] = useState(true);
  const [legacySpotifyAvailable, setLegacySpotifyAvailable] = useState(false);
  const [legacySpotifyBusy, setLegacySpotifyBusy] = useState(false);
  const [spotifyPasteOpen, setSpotifyPasteOpen] = useState(false);
  const [spotifyPasteCode, setSpotifyPasteCode] = useState("");
  const [spotifyPasteBusy, setSpotifyPasteBusy] = useState(false);
  const [spotifyPasteError, setSpotifyPasteError] = useState<string | null>(null);
  const [spotifyNote, setSpotifyNote] = useState<string | null>(null);
  const [lastfmUser, setLastfmUser] = useState("");
  const [lastfmSaved, setLastfmSaved] = useState(false);
  const [lastfmNote, setLastfmNote] = useState<string | null>(null);
  const lastfmPollRef = useRef<number | null>(null);

  const stopLastfmPoll = useCallback(() => {
    if (lastfmPollRef.current !== null) {
      window.clearInterval(lastfmPollRef.current);
      lastfmPollRef.current = null;
    }
  }, []);

  const adoptLastfm = useCallback((name: string) => {
    if (!user?.id || !name) return;
    writeLastfmUsername(user.id, name);
    clearLastfmPending();
    setLastfmUser(name);
    setLastfmSaved(true);
    setLastfmNote(`Connected as ${name} — what you play on SoundCloud now shows on your profile.`);
    stopLastfmPoll();
  }, [user?.id, stopLastfmPoll]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setSpotifyChecking(true);
    // Ask the server — not this browser's storage — whether the account is
    // linked. An old browser-only connection is offered as an explicit import
    // because that key was never bound to a Disband account.
    setLegacySpotifyAvailable(hasLegacySpotifyConnection());
    void (async () => {
      const connected = await getSpotifyConnection().catch(() => false);
      if (!live) return;
      setSpotifyConnected(connected);
      setSpotifyChecking(false);
    })();
    setLastfmSaved(false);
    setLastfmNote(null);
    // A one-click connect may have finished while the modal was closed; the
    // pending username is adopted here, otherwise the saved one is loaded.
    const pending = readLastfmPending();
    if (user?.id) {
      const saved = readLastfmUsername(user.id);
      if (pending && pending !== saved) {
        writeLastfmUsername(user.id, pending);
        clearLastfmPending();
        setLastfmUser(pending);
        setLastfmSaved(true);
      } else {
        if (pending) clearLastfmPending();
        setLastfmUser(saved ?? "");
        // A username already in storage is a completed connection. Without
        // this, reopening Settings showed the value but left the card
        // "Not connected" and kept the Connect button visible.
        setLastfmSaved(Boolean(saved));
      }
    } else {
      setLastfmUser("");
    }
    return () => {
      live = false;
    };
  }, [open, user?.id]);

  // The OAuth callback pages ping us when a popup finishes connecting.
  useEffect(() => {
    if (!open) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; username?: string } | null;
      if (data?.type === "disband:spotify-connected") {
        setSpotifyConnected(true);
        setLegacySpotifyAvailable(false);
        setSpotifyNote("Spotify connected. What you're playing now shows on your profile.");
      } else if (data?.type === "disband:lastfm-connected") {
        const name = typeof data.username === "string" ? data.username : "";
        if (name && user?.id) adoptLastfm(name);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [open, user?.id, adoptLastfm]);

  // Don't keep polling Last.fm after the settings modal closes or unmounts.
  useEffect(() => {
    if (!open) stopLastfmPoll();
    return () => stopLastfmPoll();
  }, [open, stopLastfmPoll]);

  function handleSpotifyConnect() {
    if (!spotifyClientId()) {
      setSpotifyNote("Spotify isn't configured on this build yet — add NEXT_PUBLIC_SPOTIFY_CLIENT_ID first.");
      return;
    }
    setSpotifyNote(null);
    setSpotifyPasteError(null);
    setSpotifyPasteCode("");
    const url = spotifyConnectUrl(user?.id ?? "disband");
    if (!url) return;
    if (isTauri()) {
      // The desktop WebView refuses window.open. Open the real browser and
      // finish with the code it hands back; the exchange stores the tokens
      // server-side against this signed-in account.
      void (async () => {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("plugin:opener|open_url", { url });
          setSpotifyPasteOpen(true);
        } catch {
          setSpotifyNote("Couldn't open your browser for Spotify — try the web app instead.");
        }
      })();
      return;
    }
    const popup = window.open(url, "disband-spotify-connect", "width=520,height=760,popup=yes");
    if (!popup) setSpotifyNote("Allow pop-ups for this site, then try again.");
  }

  async function finishSpotifyPaste() {
    const code = spotifyPasteCode.trim();
    if (!code || spotifyPasteBusy) return;
    setSpotifyPasteBusy(true);
    setSpotifyPasteError(null);
    try {
      await exchangeSpotifyCode(code);
      setSpotifyConnected(true);
      setLegacySpotifyAvailable(false);
      setSpotifyPasteOpen(false);
      setSpotifyPasteCode("");
      setSpotifyNote("Spotify connected. What you're playing now shows on your profile.");
    } catch {
      setSpotifyPasteError(
        "That code didn't work — codes expire after a few minutes. Hit Connect Spotify to try again.",
      );
    } finally {
      setSpotifyPasteBusy(false);
    }
  }

  async function handleSpotifyDisconnect() {
    try {
      await disconnectSpotify();
    } catch {
      setSpotifyNote("Couldn't disconnect Spotify. Try again in a moment.");
      return;
    }
    setSpotifyConnected(false);
    setLegacySpotifyAvailable(false);
    setSpotifyNote("Disconnected — your profile no longer shows a track.");
    // Best-effort immediate clear; the poller clears it on its next tick too.
    void updateProfile({ listening: null });
  }

  async function handleImportLegacySpotify() {
    if (legacySpotifyBusy) return;
    setLegacySpotifyBusy(true);
    setSpotifyNote(null);
    try {
      const imported = await importLegacySpotifyConnection();
      const stillAvailable = hasLegacySpotifyConnection();
      setLegacySpotifyAvailable(stillAvailable);
      if (imported) {
        setSpotifyConnected(true);
        setSpotifyNote("Spotify connected. What you're playing now shows on your profile.");
      } else if (stillAvailable) {
        setSpotifyNote("Couldn't import the old connection. Try again, or connect Spotify.");
      } else {
        setSpotifyNote("The old connection has expired. Connect Spotify instead.");
      }
    } finally {
      setLegacySpotifyBusy(false);
    }
  }

  function saveLastfm() {
    if (!user?.id) return;
    const name = lastfmUser.trim();
    writeLastfmUsername(user.id, name || null);
    setLastfmSaved(true);
  }

  function scrollToLastfm() {
    window.requestAnimationFrame(() => {
      document.getElementById("conn-lastfm")?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }

  function handleSoundCloudConnect() {
    setLastfmNote(
      lastfmSaved && lastfmUser.trim()
        ? `Connected as ${lastfmUser.trim()} — SoundCloud plays appear through Last.fm.`
        : "SoundCloud plays through Last.fm. Link SoundCloud to Last.fm in SoundCloud settings, then connect Last.fm here.",
    );
    scrollToLastfm();
  }

  async function handleLastfmConnect() {
    if (!lastfmConfigured()) {
      setLastfmNote("Last.fm isn't configured on this build yet — add NEXT_PUBLIC_LASTFM_API_KEY first.");
      scrollToLastfm();
      return;
    }
    setLastfmNote(null);
    stopLastfmPoll();
    try {
      const res = await apiFetch("/api/music/lastfm/token", { method: "POST" });
      const data = (await res.json().catch(() => null)) as {
        authUrl?: string;
        token?: string;
        error?: string;
      } | null;
      if (!res.ok || !data?.authUrl || !data.token) {
        setLastfmNote(
          res.status === 503
            ? "One-click connect isn't set up on the server yet — type your Last.fm username below instead."
            : data?.error ?? "Couldn't start the Last.fm connection.",
        );
        scrollToLastfm();
        return;
      }

      const token = data.token;
      const check = async (): Promise<boolean> => {
        try {
          const name = await fetchLastfmSession(token);
          adoptLastfm(name);
          return true;
        } catch {
          return false;
        }
      };

      // Last.fm's auth page does not need to redirect back to us: approving
      // the token is enough. Poll the short-lived token so the connect works
      // on the web with a popup and on desktop with the system browser.
      const startPolling = (popup: Window | null) => {
        const deadline = Date.now() + 5 * 60_000;
        lastfmPollRef.current = window.setInterval(() => {
          if (Date.now() > deadline) {
            stopLastfmPoll();
            setLastfmNote("Last.fm didn't confirm the connection. Type your username below instead.");
            return;
          }
          if (popup?.closed) {
            stopLastfmPoll();
            void check().then((ok) => {
              if (!ok) {
                setLastfmNote("Last.fm didn't confirm the connection. Type your username below instead.");
              }
            });
            return;
          }
          void check();
        }, 4_000);
      };

      if (isTauri()) {
        // The desktop WebView refuses window.open. Open the real browser;
        // the token poll still finishes the connection in the app.
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("plugin:opener|open_url", { url: data.authUrl });
        } catch {
          setLastfmNote("Couldn't open your browser for Last.fm — type your Last.fm username below.");
          scrollToLastfm();
          return;
        }
        setLastfmNote("Approve Last.fm access in your browser — this updates here automatically when it's done.");
        startPolling(null);
        return;
      }

      const popup = window.open(data.authUrl, "disband-lastfm-connect", "width=520,height=760,popup=yes");
      if (!popup) {
        setLastfmNote("Allow pop-ups for this site, then try again.");
        scrollToLastfm();
        return;
      }
      startPolling(popup);
    } catch {
      setLastfmNote("Couldn't start the Last.fm connection. Try again in a moment.");
      scrollToLastfm();
    }
  }

  function handleLastfmDisconnect() {
    if (!user?.id) return;
    stopLastfmPoll();
    writeLastfmUsername(user.id, null);
    clearLastfmPending();
    setLastfmUser("");
    setLastfmSaved(false);
    setLastfmNote("Last.fm disconnected. Your profile will stop showing its tracks.");
  }
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

  const profileInitRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) profileInitRef.current = null;
  }, [open]);

  useEffect(() => {
    if (!profile || !open) return;
    // Only seed the form when the modal opens or the account changes. Re-seeding
    // on every profile update (presence, listening, etc.) was wiping in-progress
    // edits such as a half-typed bio.
    if (profileInitRef.current === profile.id) return;
    profileInitRef.current = profile.id;
    setDisplayName(profile.display_name ?? "");
    setUsername(profile.username ?? "");
    setBio(profile.bio ?? "");
    setPronouns(profile.pronouns ?? "");
    setStatusNote(profile.status_note ?? "");
    setNameFont(profile.name_font ?? "default");
    setNameColor(profile.name_color ?? "");
    setNameColor2(profile.name_color_2 ?? "");
    setNameGradientDir(profile.name_gradient_dir ?? "135deg");
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

  const { mounted, exiting } = usePresence(open);
  if (!mounted) return null;

  const previewAccent: ProfileAccentFields = useDefaultAccent
    ? { accent_color: null, accent_color_2: null }
    : { accent_color: accent1, accent_color_2: accent2 };

  async function saveProfile() {
    setError(null);
    if (!useDefaultAccent && (!accent1.trim() || !accent2.trim())) {
      setError("Pick both profile colours, or use the default style.");
      return;
    }
    const sanitizedUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    const usernameChanged = sanitizedUsername !== (profile?.username ?? "").trim().toLowerCase();
    if (usernameChanged && sanitizedUsername.length < 2) {
      setError("Username must be at least 2 characters (letters, numbers, and underscores).");
      return;
    }
    if (!displayName.trim()) {
      setError("Enter a display name.");
      return;
    }
    setSaving(true);
    try {
      let avatarUrl: string | null = null;
      if (pendingAvatarFile) {
        const res = await upload(pendingAvatarFile);
        if (!res) {
          console.error("[saveProfile] avatar upload returned null");
          setError("Couldn't upload your profile picture. Please try again.");
          void alertDialog("Couldn't upload your profile picture. Please try again.");
          return;
        }
        avatarUrl = res.url;
      }
      let bannerUrl: string | null = null;
      if (pendingBannerFile) {
        const res = await upload(pendingBannerFile);
        if (!res) {
          console.error("[saveProfile] banner upload returned null");
          setError("Couldn't upload your banner. Please try again.");
          void alertDialog("Couldn't upload your banner. Please try again.");
          return;
        }
        bannerUrl = res.url;
      }
      const patch: Record<string, unknown> = {
        display_name: displayName.trim(),
        bio: bio.trim() || null,
        pronouns: pronouns.trim() || null,
        status_note: statusNote.trim() || null,
        status_expires_at: statusNote.trim() ? expiresAtForDuration(statusDuration) : null,
        accent_color: useDefaultAccent ? null : accent1,
        accent_color_2: useDefaultAccent ? null : accent2,
        status,
        name_font: nameFont === "default" ? null : nameFont,
        name_color: subPlan === "aero" ? (nameColor || (nameColor2 ? "#ffffff" : null)) : null,
        name_color_2: subPlan === "aero" ? (nameColor2 || null) : null,
        name_gradient_dir: subPlan === "aero" ? (nameGradientDir || "135deg") : null,
      };
      if (usernameChanged) patch.username = sanitizedUsername;
      if (pendingAvatarFile && avatarUrl) {
        patch.avatar_url = avatarUrl;
      } else if (removeAvatar) {
        patch.avatar_url = null;
      }
      if (pendingBannerFile && bannerUrl) {
        patch.banner_url = bannerUrl;
      } else if (removeBanner) {
        patch.banner_url = null;
      }
      const err = await updateProfile(patch as Parameters<typeof updateProfile>[0]);
      if (!err) {
        if (pendingAvatarFile) {
          if (previewUrlsRef.current.avatar) URL.revokeObjectURL(previewUrlsRef.current.avatar);
          previewUrlsRef.current.avatar = null;
          setAvatarPreview(null);
          setPendingAvatarFile(null);
        }
        if (removeAvatar) {
          if (previewUrlsRef.current.avatar) URL.revokeObjectURL(previewUrlsRef.current.avatar);
          previewUrlsRef.current.avatar = null;
          setAvatarPreview(null);
          setPendingAvatarFile(null);
          setRemoveAvatar(false);
        }
        if (pendingBannerFile) {
          if (previewUrlsRef.current.banner) URL.revokeObjectURL(previewUrlsRef.current.banner);
          previewUrlsRef.current.banner = null;
          setBannerPreview(null);
          setPendingBannerFile(null);
        }
        if (removeBanner) {
          if (previewUrlsRef.current.banner) URL.revokeObjectURL(previewUrlsRef.current.banner);
          previewUrlsRef.current.banner = null;
          setBannerPreview(null);
          setPendingBannerFile(null);
          setRemoveBanner(false);
        }
      }
      if (err) {
        setError(err);
        void alertDialog(err, "Couldn't save your profile");
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your profile.");
    } finally {
      setSaving(false);
    }
  }

  const profileDirty = !!profile && (
    avatarPreview !== null ||
    bannerPreview !== null ||
    pendingAvatarFile !== null ||
    pendingBannerFile !== null ||
    removeAvatar ||
    removeBanner ||
    displayName !== (profile.display_name ?? "") ||
    username !== (profile.username ?? "") ||
    bio !== (profile.bio ?? "") ||
    pronouns !== (profile.pronouns ?? "") ||
    statusNote !== (profile.status_note ?? "") ||
    nameFont !== (profile.name_font ?? "default") ||
    nameColor !== (profile.name_color ?? "") ||
    nameColor2 !== (profile.name_color_2 ?? "") ||
    nameGradientDir !== (profile.name_gradient_dir ?? "135deg") ||
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
    if (pendingAvatarFile) {
      if (previewUrlsRef.current.avatar) URL.revokeObjectURL(previewUrlsRef.current.avatar);
      previewUrlsRef.current.avatar = null;
      setAvatarPreview(null);
      setPendingAvatarFile(null);
    }
    if (pendingBannerFile) {
      if (previewUrlsRef.current.banner) URL.revokeObjectURL(previewUrlsRef.current.banner);
      previewUrlsRef.current.banner = null;
      setBannerPreview(null);
      setPendingBannerFile(null);
    }
    setDisplayName(profile.display_name ?? "");
    setUsername(profile.username ?? "");
    setBio(profile.bio ?? "");
    setPronouns(profile.pronouns ?? "");
    setStatusNote(profile.status_note ?? "");
    setNameFont(profile.name_font ?? "default");
    setNameColor(profile.name_color ?? "");
    setNameColor2(profile.name_color_2 ?? "");
    setNameGradientDir(profile.name_gradient_dir ?? "135deg");
    setStatusDuration(presetForExpiresAt(profile.status_expires_at));
    const custom = usesCustomAccent(profile);
    setUseDefaultAccent(!custom);
    setAccent1(profile.accent_color ?? DEFAULT_ACCENT);
    setAccent2(profile.accent_color_2 ?? profile.accent_color ?? "#eb459e");
    setStatus(profile.preferred_status ?? profile.status);
  }

  function pickAvatar(file: File) {
    if (previewUrlsRef.current.avatar) URL.revokeObjectURL(previewUrlsRef.current.avatar);
    const url = URL.createObjectURL(file);
    previewUrlsRef.current.avatar = url;
    setAvatarPreview(url);
    setPendingAvatarFile(file);
  }

  function handleBanner(file: File) {
    if (previewUrlsRef.current.banner) URL.revokeObjectURL(previewUrlsRef.current.banner);
    const url = URL.createObjectURL(file);
    previewUrlsRef.current.banner = url;
    setBannerPreview(url);
    setPendingBannerFile(file);
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

  const activeTab = TABS.find((item) => item.id === tab);
  const navQ = navQuery.trim().toLowerCase();
  const navMatches = navQ
    ? TABS.filter((item) => `${t(item.label)} ${item.keywords} ${item.label}`.toLowerCase().includes(navQ))
    : TABS;
  const selectedLanguage = languageFor(language);
  const docsHref = selectedLanguage.docsPath
    ? `https://docs.disband.dev/${selectedLanguage.docsPath}/`
    : "https://docs.disband.dev/";

  return (
    <>
      <SettingsLayer
        label={t("User Settings")}
        exiting={exiting}
        onClose={onClose}
        contentKey={tab}
        wide
        mobileNav={
          <select
            value={tab}
            onChange={(e) => {
              const id = e.target.value as SettingsTab;
              if (id === "bots") {
                const url = "https://disband.dev/developers/applications";
                if (isTauri()) {
                  void import("@tauri-apps/api/core").then(({ invoke }) =>
                    invoke("plugin:opener|open_url", { url }),
                  );
                } else {
                  window.open(url, "_blank", "noopener,noreferrer");
                }
                return;
              }
              setTab(id);
            }}
            aria-label={t("Settings section")}
            className="w-full rounded-[4px] bg-bg-tertiary px-2 py-2 text-[16px] font-semibold text-text-normal outline-none"
          >
            {TABS.map((item) => (
              <option key={item.id} value={item.id}>{t(item.label)}</option>
            ))}
          </select>
        }
        sidebar={
          <>
            <label className="relative mb-3 block px-2.5">
              <input
                value={navQuery}
                onChange={(e) => setNavQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && navMatches[0]) {
                    setTab(navMatches[0].id);
                    setNavQuery("");
                  }
                }}
                placeholder={t("Search")}
                aria-label={t("Search settings")}
                className="h-7 w-full rounded-[4px] bg-bg-tertiary px-1.5 pr-7 text-[14px] text-text-normal outline-none placeholder:text-text-muted"
              />
              <IconSearch size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-text-muted" />
            </label>
            {navQuery.trim() && navMatches.length === 0 && (
              <p className="px-2.5 py-2 text-[14px] text-text-muted">
                {t("No settings match “{query}”.", { query: navQuery.trim() })}
              </p>
            )}
            {NAV_GROUPS.map((group, gi) => {
              const items = navMatches.filter((item) => item.group === group);
              if (items.length === 0) return null;
              return (
                <div key={group}>
                  {gi > 0 && <SettingsNavSeparator />}
                  <SettingsNavHeader>{t(NAV_GROUP_LABEL[group])}</SettingsNavHeader>
                  {items.map((item) => (
                    <SettingsNavItem
                      key={item.id}
                      active={tab === item.id}
                      onClick={() => {
                        if (item.id === "bots") {
                          const url = "https://disband.dev/developers/applications";
                          if (isTauri()) {
                            void import("@tauri-apps/api/core").then(({ invoke }) =>
                              invoke("plugin:opener|open_url", { url }),
                            );
                          } else {
                            window.open(url, "_blank", "noopener,noreferrer");
                          }
                          return;
                        }
                        setTab(item.id);
                        setNavQuery("");
                      }}
                    >
                      {t(item.label)}
                    </SettingsNavItem>
                  ))}
                </div>
              );
            })}
            <SettingsNavSeparator />
            <SettingsNavItem
              onClick={() => {
                onClose();
                window.location.href = "/bug-report";
              }}
            >
              {t("Report a Bug")}
            </SettingsNavItem>
            <SettingsNavSeparator />
            <SettingsNavItem onClick={() => void signOut()} trailing={<IconLeave size={16} />}>
              {t("Log Out")}
            </SettingsNavItem>
            <SettingsNavSeparator />
            <p className="px-2.5 py-2 text-[12px] leading-4 text-text-muted">Disband {process.env.NEXT_PUBLIC_APP_VERSION ?? ""}</p>
          </>
        }
      >
        <h2 className="mb-5 text-[20px] font-semibold leading-6 text-header-primary">
          {activeTab ? t(activeTab.label) : t("Settings")}
        </h2>
              {tab === "profile" && (
                <div className="grid grid-cols-1 gap-6 pb-20 lg:grid-cols-[1fr_320px]">
                  <div className="min-w-0 space-y-6">
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

                  <SettingsSection
                    title="Name style (beta)"
                    description="Customize the font of your display name. Colour customization requires Disband Aero."
                  >
                    <SettingRow label="Name font" description="Choose a font for your display name. Spooky is available during Halloween." stacked>
                      <div className="flex flex-wrap gap-2">
                        {NAME_FONT_OPTIONS.filter((f) => isNameFontAvailable(f.id)).map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => setNameFont(f.id)}
                            className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${NAME_FONT_CLASS[f.id as NameFontId] ?? ""} ${
                              nameFont === f.id
                                ? "bg-brand text-white"
                                : "bg-bg-tertiary text-text-muted hover:bg-interactive-hover hover:text-text-normal"
                            }`}
                          >
                            {f.label}
                            {f.beta && <span className="ml-1 text-[10px] opacity-70">beta</span>}
                            {f.limited && <span className="ml-1 text-[10px] opacity-70">limited</span>}
                          </button>
                        ))}
                      </div>
                    </SettingRow>

                    <SettingRow
                      label="Name colour"
                      description={subPlan === "aero" ? "Pick a colour for your display name." : "Requires Disband Aero."}
                      stacked
                    >
                      {subPlan === "aero" ? (
                        <div className="flex flex-wrap items-center gap-3">
                          <label className="flex flex-col gap-1 text-[12px] text-text-muted">
                            <span>Start colour</span>
                            <input
                              type="color"
                              value={nameColor || "#ffffff"}
                              onChange={(e) => setNameColor(e.target.value)}
                              className="h-10 w-20 cursor-pointer rounded border border-divider bg-bg-tertiary"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-[12px] text-text-muted">
                            <span>End colour (gradient)</span>
                            <input
                              type="color"
                              value={nameColor2 || nameColor || "#ffffff"}
                              onChange={(e) => setNameColor2(e.target.value)}
                              className="h-10 w-20 cursor-pointer rounded border border-divider bg-bg-tertiary"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => setNameColor2("")}
                            className="text-[12px] text-text-muted hover:text-text-normal"
                          >
                            Clear gradient
                          </button>
                          <label className="flex flex-col gap-1 text-[12px] text-text-muted">
                            <span>Gradient direction</span>
                            <select
                              value={nameGradientDir}
                              onChange={(e) => setNameGradientDir(e.target.value)}
                              className="h-10 rounded border border-divider bg-bg-tertiary px-2 text-text-normal"
                            >
                              <option value="90deg">Left to right</option>
                              <option value="180deg">Top to bottom</option>
                              <option value="270deg">Right to left</option>
                              <option value="0deg">Bottom to top</option>
                              <option value="45deg">Bottom-left to top-right</option>
                              <option value="135deg">Top-left to bottom-right</option>
                              <option value="225deg">Top-right to bottom-left</option>
                              <option value="315deg">Bottom-right to top-left</option>
                            </select>
                          </label>
                        </div>
                      ) : (
                        <p className="text-[12px] text-text-muted">Upgrade to Aero to customize your name colour.</p>
                      )}
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

                  {profile && <GuildTagPicker userId={profile.id} />}

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

                  {myAllBadges.length > 0 && (
                    <SettingsSection
                      title="Badges"
                      description="Choose which of your badges show on your profile. Hidden badges stay on your account, so you can turn them back on any time."
                    >
                      {myAllBadges.map((badge) => (
                        <div
                          key={badge.key}
                          className={`flex items-center gap-3.5 border-b border-divider px-5 py-3.5 transition-opacity duration-200 last:border-b-0 ${badge.visible ? "" : "opacity-60"}`}
                        >
                          <span
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px]"
                            style={{ backgroundColor: `${badge.accent}24`, color: badge.accent }}
                            aria-hidden
                          >
                            <BadgeGlyph badgeKey={badge.key} size={18} />
                          </span>
                          <label htmlFor={`badge-${badge.key}`} className="min-w-0 flex-1 cursor-pointer">
                            <span className="block text-[14px] font-medium text-text-normal">{badge.name}</span>
                            <span className="block truncate text-[13px] text-text-muted">
                              {badge.visible ? badge.description : "Hidden from your profile"}
                            </span>
                          </label>
                          <Toggle
                            id={`badge-${badge.key}`}
                            label={`Show ${badge.name} on your profile`}
                            checked={badge.visible}
                            onChange={async () => {
                              if (!profile?.id) return;
                              const next = !badge.visible;
                              const flip = (visible: boolean) =>
                                setMyAllBadges((prev) =>
                                  prev.map((item) => (item.key === badge.key ? { ...item, visible } : item)),
                                );
                              flip(next);
                              setBadgeError(null);
                              const err = await setBadgeVisible(profile.id, badge.key, next);
                              if (err) {
                                flip(!next);
                                setBadgeError(err);
                              }
                            }}
                          />
                        </div>
                      ))}
                      {badgeError && (
                        <p role="alert" className="border-t border-divider px-5 py-3 text-[13px] text-status-dnd">{badgeError}</p>
                      )}
                    </SettingsSection>
                  )}

                  {error && <p className="text-sm text-status-dnd">{error}</p>}

                  {(profileDirty || saving || saved) && (
                    <div className="sticky bottom-0 -mx-8 mt-8 flex items-center justify-end gap-3 border-t border-divider bg-overlay-panel px-8 py-3">
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

                {profile && (
                  <div className="hidden lg:block">
                    <div className="sticky top-4">
                      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-text-muted">Preview</p>
                      <ProfilePreview
                        profile={{
                          ...profile,
                          display_name: displayName,
                          username,
                          bio,
                          pronouns,
                          status_note: statusNote,
                          accent_color: useDefaultAccent ? null : accent1,
                          accent_color_2: useDefaultAccent ? null : accent2,
                          avatar_url: removeAvatar ? null : avatarPreview ?? profile.avatar_url,
                          banner_url: removeBanner ? null : bannerPreview ?? profile.banner_url,
                          name_font: nameFont === "default" ? null : nameFont,
                          name_color: subPlan === "aero" ? (nameColor || null) : null,
                          name_color_2: subPlan === "aero" ? (nameColor2 || null) : null,
                          name_gradient_dir: subPlan === "aero" ? (nameGradientDir || "135deg") : null,
                        }}
                        displayName={displayName}
                        username={username}
                        bio={bio}
                        status={status}
                        onChangeAvatar={pickAvatar}
                        onChangeBanner={(file) => void handleBanner(file)}
                      />
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setRemoveAvatar(true);
                            if (previewUrlsRef.current.avatar) URL.revokeObjectURL(previewUrlsRef.current.avatar);
                            previewUrlsRef.current.avatar = null;
                            setAvatarPreview(null);
                            setPendingAvatarFile(null);
                          }}
                          className={`${classicBtn.grey} ${classicBtn.sm}`}
                        >
                          Remove avatar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRemoveBanner(true);
                            if (previewUrlsRef.current.banner) URL.revokeObjectURL(previewUrlsRef.current.banner);
                            previewUrlsRef.current.banner = null;
                            setBannerPreview(null);
                            setPendingBannerFile(null);
                          }}
                          className={`${classicBtn.grey} ${classicBtn.sm}`}
                        >
                          Remove banner
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              )}

              {tab === "account" && (
                <>
                  <MyAccountPanel
                    onEditProfile={() => setTab("profile")}
                    onDeleteAccount={() => { setDeleteOpen(true); setDeleteError(null); }}
                  />
                  {deleteSuccess && <p className="-mt-14 mb-14 text-[14px] text-status-online">{deleteSuccess}</p>}
                  <PlatformModerationPanel />
                  <AccountRestrictionsPanel />
                  <OfficialBroadcastPanel />
                  {settingsError && <p className="text-sm text-status-dnd">{settingsError}</p>}
                </>
              )}

              {tab === "appearance" && (
                <div>
                  <SettingsSection title="Interface zoom" description="Scales the whole app. Ctrl/Cmd + and − work anywhere, and Ctrl/Cmd 0 resets.">
                    <div className="flex items-center gap-3 px-5 py-4">
                      <button
                        type="button"
                        onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 0.1))}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[3px] border border-divider text-lg text-text-normal transition-colors hover:bg-interactive-hover"
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
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[3px] border border-divider text-lg text-text-normal transition-colors hover:bg-interactive-hover"
                        aria-label="Zoom in"
                      >
                        +
                      </button>
                      <span className="w-12 shrink-0 text-right text-[14px] tabular-nums text-text-muted">
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
                            className={`flex-1 rounded-[3px] px-3 py-1.5 text-[14px] font-medium transition-colors ${
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
                            className={`overflow-hidden rounded-lg border text-left transition-[border-color,box-shadow] duration-150 ${
                              selected
                                ? "border-brand"
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
                              <p className="mt-0.5 text-[13px] text-text-muted">{t.description}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                </div>
              )}

              {tab === "language" && (
                <div>
                  <SettingsSection
                    title={t("Language")}
                    description={t("Choose the language for the Disband interface on this device.")}
                  >
                    <div className="grid grid-cols-1 gap-2 px-5 py-4 sm:grid-cols-2">
                      {LANGUAGES.map((option) => {
                        const selected = option.code === language;
                        return (
                          <button
                            key={option.code}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => setLanguage(option.code)}
                            className={`flex items-center gap-3 rounded-[6px] border px-3 py-2.5 text-left transition-colors ${
                              selected
                                ? "border-brand bg-brand/[0.08]"
                                : "border-divider hover:border-text-muted/50 hover:bg-interactive-hover"
                            }`}
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block text-[14px] font-medium text-text-normal">{option.nativeName}</span>
                              {option.code !== "en" && (
                                <span className="block text-[12px] text-text-muted">{option.englishName}</span>
                              )}
                            </span>
                            {selected && <IconCheck size={17} className="shrink-0 text-brand" />}
                          </button>
                        );
                      })}
                    </div>
                  </SettingsSection>

                  <SettingsSection
                    title={t("Documentation")}
                    description={t("Read the docs in your language.")}
                  >
                    <div className="px-5 py-4">
                      <a
                        href={docsHref}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-[4px] bg-brand px-3 py-2 text-[14px] font-medium text-white transition-colors hover:bg-brand-hover"
                      >
                        {t("Open translated docs")}
                        <IconExternalLink size={15} />
                      </a>
                    </div>
                  </SettingsSection>

                  <p className="px-1 text-[13px] leading-relaxed text-text-muted">
                    {t("Translations cover settings and core app navigation. More of the app is translated over time.")}
                  </p>
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
                          className="inline-flex h-9 items-center gap-2 rounded-[3px] bg-brand px-3.5 text-[14px] font-semibold text-white transition-colors hover:bg-brand-hover"
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
                    title="Noise cancellation"
                    description="Reduce background noise before your microphone reaches everyone else."
                  >
                    <SettingRow
                      label="Noise suppression"
                      description="Choose how Disband handles background noise. 'Enhanced' uses a lighter touch to avoid clipping your voice."
                    >
                      <select
                        value={noiseMode}
                        onChange={(e) => {
                          const mode = e.target.value as NoiseSuppressionMode;
                          setNoiseModeState(mode);
                          setNoiseSuppressionMode(mode);
                          setNoiseCancellationState(mode !== "off");
                          setNoiseCancellationEnabled(mode !== "off");
                        }}
                        className={settingsInputClass}
                      >
                        <option value="off">Off (no suppression)</option>
                        <option value="standard">Standard (browser)</option>
                        <option value="enhanced">Enhanced (lighter)</option>
                      </select>
                    </SettingRow>
                    <SettingRow
                      label="Noise cancellation strength"
                      description="Higher values remove more noise but can clip your voice."
                      stacked
                    >
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={noiseCancellationStrength}
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          setNoiseCancellationStrengthState(value);
                          setNoiseCancellationStrength(value);
                        }}
                        className={settingsInputClass}
                      />
                    </SettingRow>
                  </SettingsSection>

                  <SettingsSection
                    title="Microphone test"
                    description="Relay your voice back to yourself to check noise cancellation."
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

                  <div className="rounded-[8px] border border-divider/60 bg-bg-secondary p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0 space-y-1">
                        <p className="text-[12px] font-bold uppercase tracking-[0.02em] text-header-secondary">Current plan</p>
                        <div className="flex items-center gap-2">
                          <span className="text-[16px] font-semibold capitalize text-header-primary">{subPlan}</span>
                          <SubscriptionBadge plan={subPlan} />
                        </div>
                        {(subscription?.status === "active" || subscription?.status === "trialing") && (
                          <div className="space-y-0.5 pt-1">
                            {subscription.current_period_end && (
                              <p className="text-[12px] text-text-muted">
                                {cancellationScheduled ? "Cancels" : "Renews"} {billingPeriodEndLabel}
                              </p>
                            )}
                            <Hint tone={cancellationScheduled ? "super" : "online"}>
                              {cancellationScheduled ? "Cancellation scheduled" : "Active"}
                            </Hint>
                          </div>
                        )}
                        {subscription?.status === "past_due" && (
                          <p className="text-[12px] text-status-dnd">Payment failed</p>
                        )}
                        {subscription?.status === "canceled" && (
                          <p className="text-[12px] text-text-muted">Cancelled</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => setShowSubscription(true)}
                          className="h-8 rounded-[3px] bg-brand px-3 text-[14px] font-medium text-white transition-colors hover:bg-brand-hover"
                        >
                          {subPlan === "free" ? "Upgrade" : "Manage"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {canCancelStripe && (
                    <div className="rounded-[8px] border border-divider/60 bg-bg-secondary p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 space-y-1">
                          <p className="text-[16px] font-medium leading-6 text-header-primary">Billing</p>
                          <p className="text-[13px] leading-5 text-text-muted">
                            {cancellationScheduled
                              ? `Cancellation scheduled. Your plan stays active until ${billingPeriodEndLabel}. No refund is issued for the current period.`
                              : `Cancel future renewals. You'll keep your plan until ${billingPeriodEndLabel}; payments already made are non-refundable.`}
                          </p>
                          {billingError && <p className="text-[13px] text-status-dnd">{billingError}</p>}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setBillingError(null);
                            setBillingDialog(cancellationScheduled ? "resume" : "cancel");
                          }}
                          className={cancellationScheduled
                            ? "h-8 shrink-0 rounded-[3px] bg-brand px-3 text-[14px] font-medium text-white transition-colors hover:bg-brand-hover"
                            : "h-8 shrink-0 rounded-[3px] border border-status-dnd/40 px-3 text-[14px] font-medium text-status-dnd transition-colors hover:bg-status-dnd/10"}
                        >
                          {cancellationScheduled ? "Resume" : "Cancel subscription"}
                        </button>
                      </div>
                    </div>
                  )}

                  {subscription?.provider === "apple" && (
                    <div className="rounded-[8px] border border-divider/60 bg-bg-secondary p-4">
                      <p className="text-[16px] font-medium leading-6 text-header-primary">App Store billing</p>
                      <p className="mt-1 text-[13px] leading-5 text-text-muted">
                        This subscription is managed by Apple. Cancel or change it in your Apple Account
                        settings; Apple handles any refund requests.
                      </p>
                      <a
                        href="https://apps.apple.com/account/subscriptions"
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block text-[13px] font-medium text-brand hover:underline"
                      >
                        Manage Apple subscription
                      </a>
                    </div>
                  )}

                  <div className="rounded-[8px] border border-divider/60 bg-bg-secondary p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className="text-[16px] font-medium leading-6 text-header-primary">Gift a subscription</p>
                        <p className="text-[13px] leading-5 text-text-muted">
                          Pay once for Aero or Lite. Send the link in a DM or a channel — first to claim it gets it.
                        </p>
                        {giftLink && (
                          <div className="flex items-center gap-2 pt-1">
                            <code className="min-w-0 flex-1 truncate rounded-[3px] bg-bg-tertiary px-2 py-1 text-[12px] text-text-normal">
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
                              className="shrink-0 rounded-[3px] border border-divider px-2 py-1 text-[12px] font-medium text-text-normal transition-colors hover:bg-interactive-hover"
                            >
                              {giftCopied ? "Copied" : "Copy"}
                            </button>
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => { setGiftCopied(false); setGifting(true); }}
                        className="h-8 shrink-0 rounded-[3px] bg-brand px-3 text-[14px] font-medium text-white transition-colors hover:bg-brand-hover"
                      >
                        Gift
                      </button>
                    </div>
                  </div>
                  {myGifts && (myGifts.sent.length > 0 || myGifts.received.length > 0) && (
                    <div className="rounded-[8px] border border-divider/60 bg-bg-secondary p-4">
                      <p className="text-[16px] font-medium leading-6 text-header-primary">Your gifts</p>
                      <p className="text-[13px] leading-5 text-text-muted">
                        Everything you&apos;ve bought or claimed. The link stays here until someone uses it.
                      </p>
                      <div className="mt-3 space-y-2">
                        {myGifts.sent.map((g) => (
                          <div key={g.code} className="flex items-center justify-between gap-3 rounded-[4px] bg-bg-tertiary px-3 py-2">
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-semibold text-text-normal">
                                {GIFT_PLAN_NAME[g.plan]} · {monthsLabel(g.months)}
                              </p>
                              <p className="truncate text-[12px] text-text-muted">{giftStatusLine(g)}</p>
                            </div>
                            {g.status === "unclaimed" && (
                              <button
                                type="button"
                                onClick={() => {
                                  void navigator.clipboard
                                    ?.writeText(giftUrl(g.code, window.location.origin))
                                    .then(
                                      () => setCopiedGiftCode(g.code),
                                      () => setCopiedGiftCode(null),
                                    );
                                  window.setTimeout(
                                    () => setCopiedGiftCode((c) => (c === g.code ? null : c)),
                                    2000,
                                  );
                                }}
                                className="shrink-0 rounded-[3px] border border-divider px-2 py-1 text-[12px] font-medium text-text-normal transition-colors hover:bg-interactive-hover"
                              >
                                {copiedGiftCode === g.code ? "Copied" : "Copy link"}
                              </button>
                            )}
                          </div>
                        ))}
                        {myGifts.received.map((g) => (
                          <div key={`r-${g.code}`} className="flex items-center justify-between gap-3 rounded-[4px] bg-bg-tertiary px-3 py-2">
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-semibold text-text-normal">
                                {GIFT_PLAN_NAME[g.plan]} · {monthsLabel(g.months)}
                              </p>
                              <p className="truncate text-[12px] text-text-muted">{giftStatusLine(g, true)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
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
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-bg-secondary p-4 text-sm text-text-muted hover:bg-bg-accent disabled:opacity-50"
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
                  <div className="flex flex-col gap-1.5 rounded-lg bg-bg-secondary p-4 sm:flex-row sm:items-center sm:justify-between">
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

              {tab === "connections" && (
                <div className="pb-20">
                  {/* Discord's "Add accounts to your profile" strip */}
                  <div className="mb-8 rounded-lg bg-bg-secondary p-4">
                    <h3 className="text-[12px] font-bold uppercase leading-4 tracking-[0.02em] text-header-secondary">Add accounts to your profile</h3>
                    <p className="mt-1 text-[14px] text-header-secondary">This information won&apos;t be shared outside of Disband without your permission.</p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      {[
                        { id: "spotify", label: "Spotify", icon: <SpotifyMark />, onClick: handleSpotifyConnect, done: spotifyConnected },
                        { id: "lastfm", label: "Last.fm", icon: <LastfmMark />, onClick: () => { scrollToLastfm(); void handleLastfmConnect(); }, done: !!lastfmUser.trim() && lastfmSaved },
                        { id: "soundcloud", label: "SoundCloud (via Last.fm)", icon: <SoundcloudMark />, onClick: handleSoundCloudConnect, done: !!lastfmUser.trim() && lastfmSaved },
                        { id: "ytmusic", label: "YouTube Music (via Last.fm)", icon: <YoutubeMusicMark />, onClick: () => document.getElementById("conn-ytmusic")?.scrollIntoView({ behavior: "smooth", block: "center" }), done: false },
                      ].map((svc) => (
                        <Tooltip key={svc.id} label={svc.done ? `${svc.label} · connected` : svc.label} side="top">
                          <button
                            type="button"
                            onClick={svc.onClick}
                            aria-label={`Connect ${svc.label}`}
                            className="relative flex h-12 w-12 items-center justify-center rounded-full bg-bg-tertiary transition-[transform,background-color] hover:-translate-y-0.5 hover:bg-interactive-hover"
                          >
                            {svc.icon}
                            {svc.done && (
                              <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-bg-secondary bg-status-online">
                                <svg width="8" height="8" viewBox="0 0 24 24" fill="none"><path d="M5 12.5 10 17.5 19 7" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                              </span>
                            )}
                          </button>
                        </Tooltip>
                      ))}
                    </div>
                  </div>

                  {/* Spotify */}
                  <ConnectionCard
                    icon={<SpotifyMark size={32} />}
                    name="Spotify"
                    status={spotifyChecking ? "Checking…" : spotifyConnected ? "Connected · shows what you're playing" : "Not connected"}
                    connected={spotifyConnected}
                    actions={
                      spotifyChecking ? null : spotifyConnected ? (
                        <button type="button" onClick={() => void handleSpotifyDisconnect()} className="h-8 rounded-[3px] px-3 text-[14px] font-medium text-white hover:underline">
                          Disconnect
                        </button>
                      ) : (
                        <>
                          {legacySpotifyAvailable && (
                            <button
                              type="button"
                              disabled={legacySpotifyBusy}
                              onClick={() => void handleImportLegacySpotify()}
                              title="Older Disband builds kept this connection in this browser only."
                              className="h-8 rounded-[3px] bg-button-secondary px-3 text-[14px] font-medium text-white hover:bg-button-secondary-hover disabled:opacity-50"
                            >
                              {legacySpotifyBusy ? "Importing…" : "Import old connection"}
                            </button>
                          )}
                          <button type="button" onClick={handleSpotifyConnect} className="h-8 rounded-[3px] bg-[#1db954] px-4 text-[14px] font-medium text-white hover:brightness-95">
                            Connect
                          </button>
                        </>
                      )
                    }
                  >
                    <p className="text-[14px] text-header-secondary">
                      {spotifyConnected
                        ? "Checked every few seconds while Disband is open. On desktop it keeps working from the tray."
                        : "Read-only: we only see the track you're playing. Nothing else is touched."}
                    </p>
                    {spotifyNote && <p className="mt-2 text-[14px] text-header-secondary">{spotifyNote}</p>}
                        {spotifyPasteOpen && !spotifyConnected && (
                          <div className="mt-2 w-full space-y-2">
                            <p className="text-[14px] text-text-muted">
                              Spotify opened in your browser. Approve access there, copy the code
                              Spotify shows, and paste it here.
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                value={spotifyPasteCode}
                                onChange={(e) => setSpotifyPasteCode(e.target.value)}
                                placeholder="paste the code"
                                className="w-64 rounded-[3px] border border-transparent bg-bg-tertiary px-3 py-2 font-mono text-[14px] text-text-normal placeholder:font-sans placeholder:text-text-muted outline-none focus:border-[#00a8fc]"
                              />
                              <button
                                type="button"
                                disabled={spotifyPasteBusy || !spotifyPasteCode.trim()}
                                onClick={() => void finishSpotifyPaste()}
                                className="rounded-[3px] bg-brand px-3.5 py-2 text-[14px] font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
                              >
                                {spotifyPasteBusy ? "Connecting…" : "Connect"}
                              </button>
                            </div>
                            {spotifyPasteError && (
                              <p className="text-[14px] text-status-dnd">{spotifyPasteError}</p>
                            )}
                          </div>
                        )}
                  </ConnectionCard>

                  {/* Last.fm (and SoundCloud through it) */}
                  <ConnectionCard
                    id="conn-lastfm"
                    icon={<LastfmMark size={32} />}
                    name="Last.fm"
                    status={lastfmSaved && lastfmUser.trim() ? `Connected as ${lastfmUser.trim()}` : "Also brings in SoundCloud plays"}
                    connected={lastfmSaved && !!lastfmUser.trim()}
                    actions={
                      lastfmSaved && lastfmUser.trim() ? (
                        <button
                          type="button"
                          onClick={handleLastfmDisconnect}
                          className="h-8 rounded-[3px] px-3 text-[14px] font-medium text-white hover:underline"
                        >
                          Disconnect
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleLastfmConnect()}
                          disabled={!lastfmConfigured()}
                          className="h-8 rounded-[3px] bg-[#d51007] px-4 text-[14px] font-medium text-white hover:brightness-95 disabled:opacity-40"
                        >
                          Connect
                        </button>
                      )
                    }
                  >
                    <p className="text-[14px] text-header-secondary">
                      SoundCloud doesn&apos;t let apps read playback directly. Link SoundCloud to Last.fm once (SoundCloud › Settings › Connections), then connect Last.fm here. What you play appears on your profile within a minute, even from another device.
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <input
                        value={lastfmUser}
                        onChange={(e) => {
                          setLastfmUser(e.target.value);
                          setLastfmSaved(false);
                        }}
                        placeholder="Or type your Last.fm username"
                        disabled={!lastfmConfigured()}
                        className="h-9 w-64 rounded-[3px] border border-transparent bg-bg-tertiary px-2.5 text-[14px] text-text-normal outline-none placeholder:text-text-muted focus:border-[#00a8fc] disabled:opacity-50"
                      />
                      <button
                        type="button"
                        onClick={saveLastfm}
                        disabled={!lastfmConfigured()}
                        className="h-9 rounded-[3px] bg-button-secondary px-4 text-[14px] font-medium text-white hover:bg-button-secondary-hover disabled:opacity-40"
                      >
                        Save
                      </button>
                      {lastfmSaved && <span className="text-[14px] text-status-online">Saved.</span>}
                    </div>
                    {!lastfmConfigured() && <p className="mt-2 text-[14px] text-header-secondary">Not configured on this build yet.</p>}
                    {lastfmNote && <p className="mt-2 text-[14px] text-header-secondary">{lastfmNote}</p>}
                  </ConnectionCard>

                  {/* YouTube Music: no public now-playing API, so it rides on Last.fm */}
                  <div id="conn-ytmusic">
                    <ConnectionCard
                      icon={<YoutubeMusicMark size={32} />}
                      name="YouTube Music"
                      status={lastfmSaved && lastfmUser.trim() ? "Shows through your Last.fm" : "Works through Last.fm"}
                      connected={lastfmSaved && !!lastfmUser.trim()}
                      actions={
                        <a
                          href="https://web-scrobbler.com/"
                          target="_blank"
                          rel="noreferrer noopener"
                          className="flex h-8 items-center rounded-[3px] bg-[#ff0000] px-4 text-[14px] font-medium text-white hover:brightness-95"
                        >
                          Get the scrobbler
                        </a>
                      }
                    >
                      <p className="text-[14px] text-header-secondary">
                        YouTube Music doesn&apos;t let apps see what you&apos;re playing, so it comes through Last.fm:
                      </p>
                      <ol className="mt-2 list-decimal space-y-1 pl-5 text-[14px] text-text-normal">
                        <li>Connect Last.fm above.</li>
                        <li>
                          On a computer, install <span className="font-medium">Web Scrobbler</span> for your browser and sign it in to Last.fm. On Android,{" "}
                          <span className="font-medium">Pano Scrobbler</span> does the same for the app.
                        </li>
                        <li>Play something on YouTube Music. It shows on your profile within a minute.</li>
                      </ol>
                    </ConnectionCard>
                  </div>

                  <p className="mt-6 text-[14px] text-header-secondary">
                    Your listening card (artwork, track and artist) shows on your profile to everyone who can see it. Disconnect an account to hide it instantly.
                  </p>
                </div>
              )}

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
      </SettingsLayer>

      <SubscriptionModal
        open={showSubscription}
        onClose={() => setShowSubscription(false)}
        userId={profile?.id}
      />

      <ConfirmDialog
        open={billingDialog !== null}
        title={billingDialog === "resume" ? "Resume subscription?" : "Cancel subscription?"}
        tone={billingDialog === "resume" ? "primary" : "danger"}
        confirmLabel={billingDialog === "resume" ? "Resume" : "Cancel subscription"}
        body={
          <div className="space-y-2">
            <p>
              {billingDialog === "resume"
                ? `Renewal will restart. Your plan will continue after ${billingPeriodEndLabel}.`
                : `You'll keep your plan until ${billingPeriodEndLabel}. Renewal stops after that, and payments already made are non-refundable.`}
            </p>
            {billingError && <p className="text-status-dnd">{billingError}</p>}
          </div>
        }
        onConfirm={async () => {
          const action = billingDialog;
          if (!action) return;
          setBillingError(null);
          const err = await cancelSubscription(action === "resume");
          if (err) {
            setBillingError(err);
            return;
          }
          setBillingDialog(null);
        }}
        onCancel={() => {
          setBillingError(null);
          setBillingDialog(null);
        }}
      />

      {giftMounted && (
        <GiftModal
          exiting={giftExiting}
          onClose={() => setGifting(false)}
          onPurchased={(code) => {
            setGiftLink(giftUrl(code, window.location.origin));
            setGifting(false);
            void loadMyGifts();
          }}
        />
      )}
      <ClassicModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete Account"
        centered={false}
        footer={
          <>
            <button type="button" onClick={() => setDeleteOpen(false)} className={`${classicBtn.link} ${classicBtn.md}`}>
              Cancel
            </button>
            <button
              type="button"
              disabled={deletingAccount}
              onClick={async () => {
                setDeletingAccount(true);
                setDeleteError(null);
                try {
                  const res = await requestAccountDeletion();
                  if (res.error) { setDeleteError(res.error); return; }
                  setDeleteOpen(false);
                  if (res.instant) {
                    await signOut();
                  } else {
                    setDeleteSuccess("Deletion scheduled. Log in within 24 hours to cancel.");
                  }
                } finally {
                  setDeletingAccount(false);
                }
              }}
              className={`${classicBtn.danger} ${classicBtn.md}`}
            >
              {deletingAccount ? "Deleting…" : "Delete Account"}
            </button>
          </>
        }
      >
        <div className="rounded-[3px] bg-[#f0b232] p-2.5 text-[14px] leading-[18px] text-white">
          {isAnonymous
            ? "Your profile and all data are removed immediately. This can't be undone."
            : "Your username, avatar, banner and bio are anonymised. You can cancel within 24 hours by logging back in; after 14 days the account is purged for good."}
        </div>
        {deleteError && <p className="mt-3 text-[14px] text-status-dnd">{deleteError}</p>}
      </ClassicModal>
    </>
  );
}

/** One connected-service card, Discord style. */
function ConnectionCard({
  id,
  icon,
  name,
  status,
  connected,
  actions,
  children,
}: {
  id?: string;
  icon: React.ReactNode;
  name: string;
  status: string;
  connected: boolean;
  actions: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section id={id} className="mb-4 scroll-mt-6 overflow-hidden rounded-lg bg-bg-secondary">
      <header className="flex items-center gap-3 bg-bg-tertiary/60 px-4 py-3">
        <span className="shrink-0">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[16px] font-semibold text-header-primary">
            {name}
            {connected && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-status-online">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none"><path d="M5 12.5 10 17.5 19 7" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
            )}
          </p>
          <p className="truncate text-[12px] text-header-secondary">{status}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      </header>
      {children && <div className="px-4 py-3">{children}</div>}
    </section>
  );
}

function SpotifyMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="11" fill="#1db954" />
      <path d="M6.5 9.3c3.8-1.1 8-.8 11.2 1M7 12.6c3.1-.9 6.5-.6 9.2.9M7.6 15.6c2.5-.6 5-.4 7.1.7" fill="none" stroke="#000" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function LastfmMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="11" fill="#d51007" />
      <text x="12" y="15.6" textAnchor="middle" fontSize="9.5" fontWeight="800" fill="#fff" fontFamily="inherit">fm</text>
    </svg>
  );
}

function SoundcloudMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="11" fill="#ff5500" />
      <path d="M10 15.5V9.6a3.8 3.8 0 0 1 7.2 1.4 2.3 2.3 0 0 1 .3 4.5Z" fill="#fff" />
      <path d="M8.6 15.5v-5M7.2 15.5v-3.6M5.8 15.5V13" stroke="#fff" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

function YoutubeMusicMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="11" fill="#ff0000" />
      <circle cx="12" cy="12" r="5.6" fill="none" stroke="#fff" strokeWidth="1.3" />
      <path d="M10.6 9.6v4.8l4-2.4Z" fill="#fff" />
    </svg>
  );
}

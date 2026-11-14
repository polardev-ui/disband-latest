"use client";

import type { AeroCheckoutRequest } from "@/components/subscription/AeroPage";
import { AppearanceEffect } from "./AppearanceEffect";
import { favoritesAvailable, isFavorite, toggleFavorite, useFavorites, type FavoriteKind } from "@/lib/favorites";
import { pinnedAt, pinsAvailable, togglePin } from "@/lib/pinned-conversations";
import { ReminderDialog, type ReminderTarget } from "./SavedMessages";
import { findSaved, saveMessage, savedAvailable, unsaveMessage, useSavedMessages } from "@/lib/saved-messages";
import { appearanceEntitled } from "@/lib/appearance";
import { FavoritesPanel } from "./FavoritesPanel";
import { ForumView } from "./ForumView";
import { SlowModeNotice } from "./SlowModeNotice";
import { isTauri } from "@/lib/platform";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/components/theme/ThemeProvider";
import { isThemeId } from "@/lib/theme/themes";
import { useProfileMember } from "@/hooks/useProfileMember";
import { usePresence } from "@/hooks/usePresence";
import { applyAudioOutputToElement, getPreferredAudioOutputId } from "@/lib/audio-settings";
import { useApp } from "@/contexts/AppContext";
import { useI18n } from "@/contexts/I18nContext";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useUrlRoutes } from "@/hooks/useUrlRoutes";
import { useZoom, ZOOM_STEP } from "@/hooks/useZoom";
import { requestNotificationPermissionFromGesture } from "@/lib/notifications";
import { useCallManager } from "@/hooks/useCallManager";
import { useGroupCallManager } from "@/hooks/useGroupCallManager";
import { useSubscription } from "@/hooks/useSubscription";
import { useServerVoicePresence } from "@/hooks/useServerVoicePresence";
import { useContextMenu, type ContextMenuItem } from "@/components/ui/ContextMenu";
import { setCallIndicatorState } from "@/lib/call-status";
import { ServerList } from "./ServerList";
import { TimeoutModal } from "@/components/modals/TimeoutModal";
import { GuildTagSpaceModal } from "./GuildTagSpaceModal";
import { ChannelList } from "./ChannelList";
import { HomePanel } from "./HomePanel";
import { DiscoverPanel, DiscoverSidebar, type DiscoverTab } from "./DiscoverPanel";
import { UserPanel } from "./UserPanel";
import dynamic from "next/dynamic";
import { ActiveNowPanel, FriendsPanel } from "./FriendsPanel";
import { NotificationBell } from "./NotificationBell";
import { ChatCanvas, type ChatCanvasHandle } from "./ChatCanvas";
import { VoicePanel } from "./VoicePanel";
import { MemberList } from "./MemberList";
import { getLastChannelId } from "@/lib/server-last-channel";
import {
  CallPanel,
  GroupRingOverlay,
  HeaderCallButton,
  IncomingCallOverlay,
} from "./CallUI";
import { GroupCallStage } from "./GroupCallStage";
import { StagePanel } from "./StagePanel";
import { GroupMemberList } from "./GroupMemberList";
import { InviteGroupModal } from "./InviteGroupModal";
import { InviteSpaceModal } from "./InviteSpaceModal";
import { SpaceNotificationsModal } from "./SpaceNotificationsModal";
import { CreateChannelModal } from "./CreateChannelModal";
import { alertDialog, confirmDialog, promptDialog } from "@/lib/dialogs";
const SettingsModal = dynamic(() => import("./SettingsModal").then(m => m.SettingsModal));
import { CreateServerModal } from "@/components/modals/CreateServerModal";
import { DonationAppealModal } from "@/components/modals/DonationAppealModal";
const ServerSettingsModal = dynamic(() => import("@/components/modals/ServerSettingsModal").then(m => m.ServerSettingsModal));
const ChannelSettingsModal = dynamic(() => import("@/components/modals/ChannelSettingsModal").then(m => m.ChannelSettingsModal));
import { UserProfileModal } from "@/components/modals/UserProfileModal";
import { ReportModal, type ReportTarget } from "@/components/modals/ReportModal";
import {
  IconCopy,
  IconBell,
  IconCheckAll,
  IconLink,
  IconUserPlus,
  IconClose,
  IconLeave,
  IconSettings,
  IconShield,
  IconTrash,
  IconFriends,
  IconGroup,
  IconPhone,
  IconStar,
  IconNotes,
  IconMegaphone,
  IconForum,
  IconChevronLeft,
  IconBookmark,
  IconAlarm,
  IconPin,
  IconPinOff,
  IconMenu,
  IconPlus,
  IconEdit,
  IconFolder,
  IconFolderPlus,
  IconFolderMinus,
  IconTimer,
  IconVerified,
} from "@/components/icons";
const SubscriptionModal = dynamic(() => import("@/components/subscription/SubscriptionModal").then(m => m.SubscriptionModal));
const AeroPage = dynamic(() => import("@/components/subscription/AeroPage").then(m => m.AeroPage));
const ShopModal = dynamic(() => import("@/components/shop/ShopModal").then(m => m.ShopModal));
import { displayName, getInviteUrl, normalizeMessageContent } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { shopItem, type ShopCategory } from "@/lib/shop";
import type { Channel, ChannelCategory, Profile, Server, ServerFolder } from "@/lib/supabase/types";
import { ServerFolderDialog } from "@/components/discord/ServerFolderDialog";
import { toReplyAuthor, type MessageContext } from "@/lib/messages";
import type { ChatMessageData } from "./ChatMessage";
import { ForwardModal, type ForwardDestination } from "./ForwardModal";
import { PinnedMessagesPanel } from "./PinnedMessagesPanel";
import { HeaderToolbar } from "./HeaderToolbar";
import SearchPanel from "./SearchPanel";
import { useGameActivity } from "@/hooks/useGameActivity";
import { DmProfileRail } from "./DmProfileRail";
import { MessageRequestBar } from "./MessageRequestBar";
import { CatalystModal } from "./CatalystModal";
import { CallIndicator } from "./CallIndicator";
import { QuickSwitcher } from "./QuickSwitcher";
import { UserProfilePopout } from "./UserProfilePopout";

export function DiscordApp() {
  const app = useApp();
  // Discord-style addresses (/channels/@me, /channels/<space>/<channel>) on the web.
  useUrlRoutes({
    viewMode: app.viewMode,
    activeServerId: app.activeServerId,
    activeChannelId: app.activeChannelId,
    activeDmThreadId: app.activeDmThreadId,
    activeGroupChatId: app.activeGroupChatId,
    isDmThread: (id) => app.dmThreads.some((t) => t.id === id),
    isGroupChat: (id) => app.groupChats.some((g) => g.id === id),
    setViewHome: app.setViewHome,
    setViewNotes: app.setViewNotes,
    setViewDiscover: app.setViewDiscover,
    selectServer: app.selectServer,
    routeToNotification: app.routeToNotification,
  });
  const { t } = useI18n();
  const { openMenu } = useContextMenu();
  const { theme, setTheme } = useTheme();

  // The theme is saved to the account, and phones already follow it. The web
  // only kept its own copy, so a theme picked elsewhere never showed up here.
  // Adopt the account's theme once per sign-in; picking one here saves it back.
  const adoptedThemeFor = useRef<string | null>(null);
  useEffect(() => {
    const profile = app.profile;
    if (!profile || adoptedThemeFor.current === profile.id) return;
    adoptedThemeFor.current = profile.id;
    if (isThemeId(profile.theme) && profile.theme !== theme) setTheme(profile.theme);
  }, [app.profile, theme, setTheme]);
  const [timeoutTarget, setTimeoutTarget] = useState<{ userId: string; profile: Profile } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [discoverTab, setDiscoverTab] = useState<DiscoverTab>("popular");
  const [discoverQuery, setDiscoverQuery] = useState("");
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  // Checkout the Aero page asked for, handed to SubscriptionModal.
  const [checkoutStart, setCheckoutStart] = useState<AeroCheckoutRequest | null>(null);
  // What the main column shows in the home view: friends, or the Aero page.
  const [homePage, setHomePage] = useState<"friends" | "aero">("friends");
  // The rail's star: the sidebar lists favorites in place of channels/DMs.
  const [favoritesView, setFavoritesView] = useState(false);
  // "Remind me…" on a message (Lite and Aero).
  const [reminderTarget, setReminderTarget] = useState<ReminderTarget | null>(null);
  // Loads saved messages once per account, so the menu knows what's saved.
  useSavedMessages(app.user?.id);
  // Loads the favorites list once per account, so menus know what's starred.
  useFavorites(app.user?.id);
  const [shopOpen, setShopOpen] = useState(false);
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);
  // Ctrl/⌘+K opens the Quick Switcher from anywhere in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k") {
        // Settings hides the app layer the switcher lives in, so opening it
        // there gave an invisible box that took the keyboard from the page.
        if (document.body.classList.contains("layer-open")) return;
        e.preventDefault();
        setQuickSwitcherOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [shopCategory, setShopCategory] = useState<ShopCategory>("ring");
  const [shopPurchase, setShopPurchase] = useState<string | null>(null);
  const [giftReturn, setGiftReturn] = useState<string | null>(null);
  const [settingsInitialTab, setSettingsInitialTab] = useState<"subscriptions" | "creator" | "account" | null>(null);
  const [createServerOpen, setCreateServerOpen] = useState(false);
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false);
  const [folderDialog, setFolderDialog] = useState<{ mode: "create" | "edit"; folderId: string | null } | null>(null);
  // Keep the dialog's data around while it animates out: closing clears
  // `folderDialog`, which would otherwise unmount it mid-fade.
  const folderDialogOpen = !!folderDialog;
  const { mounted: folderDialogMounted, exiting: folderDialogExiting } = usePresence(folderDialogOpen);
  const lastFolderDialogRef = useRef(folderDialog);
  if (folderDialog) lastFolderDialogRef.current = folderDialog;
  const shownFolderDialog = folderDialog ?? lastFolderDialogRef.current;
  const [pendingFolderServer, setPendingFolderServer] = useState<Server | null>(null);
  const [channelSettingsChannel, setChannelSettingsChannel] = useState<Channel | null>(null);
  const [profileTarget, setProfileTarget] = useState<Profile | null>(null);
  // Profiles open as a popout beside whatever was clicked; "View Full
  // Profile" (or a keyboard open with nothing to anchor to) uses the modal.
  const [profileAnchor, setProfileAnchor] = useState<DOMRect | null>(null);
  const [profileFull, setProfileFull] = useState(false);
  const lastPointer = useRef<{ rect: DOMRect; at: number } | null>(null);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.("[data-member-row], button, [role=button], a, img");
      if (el) lastPointer.current = { rect: el.getBoundingClientRect(), at: Date.now() };
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, []);
  const [inviteGroupOpen, setInviteGroupOpen] = useState(false);
  const [inviteSpace, setInviteSpace] = useState<Server | null>(null);
  const [notifySpace, setNotifySpace] = useState<Server | null>(null);
  const [createChannelTarget, setCreateChannelTarget] = useState<{ categoryId: string | null } | null>(null);
  const [inviteGroupId, setInviteGroupId] = useState<string | null>(null);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);
  const [forwardMessage, setForwardMessage] = useState<ChatMessageData | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);

  const [showDmProfile, setShowDmProfile] = useState(true);
  // Desktop: publish the game you're playing (detection and Rich Presence).
  useGameActivity();
  const [searchOpen, setSearchOpen] = useState(false);
  // Typed in the header search box; the search panel shows its results.
  const [searchQuery, setSearchQuery] = useState("");
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery("");
  }, []);
  const [membersVisible, setMembersVisible] = useState(true);
  useEffect(() => {
    try {
      const v = localStorage.getItem('disband:membersVisible');
      if (v != null) setMembersVisible(v === '1');
    } catch {}
  }, []);
  const persistMembersVisible = useCallback((v: boolean) => {
    setMembersVisible(v);
    try { localStorage.setItem('disband:membersVisible', v ? '1' : '0'); } catch {}
  }, []);
  const handleSearchJump = useCallback((messageId: string, containerId: string, sourceKind: string) => {
    void (async () => {
      if (sourceKind === "channel") {
        if (app.activeChannelId !== containerId) void app.selectChannel(containerId);
        await app.loadChannelContextWindow(messageId);
        setTimeout(() => channelChatRef.current?.jumpToMessage(messageId), 200);
      } else if (sourceKind === "dm") {
        if (app.activeDmThreadId !== containerId) await app.selectDmThread(containerId);
        await app.loadDmContextWindow(messageId);
        setTimeout(() => dmChatRef.current?.jumpToMessage(messageId), 200);
      } else if (sourceKind === "group") {
        if (app.activeGroupChatId !== containerId) await app.selectGroupChat(containerId);
        await app.loadGroupContextWindow(messageId);
        setTimeout(() => groupChatRef.current?.jumpToMessage(messageId), 200);
      }
    })();
  }, [app]);


  const [catalystServerId, setCatalystServerId] = useState<string | null>(null);
  // Shown in place of the chat while you are in that space; leaving it closes the page.
  const catalystPage = catalystServerId !== null && app.viewMode === "space" && app.activeServerId === catalystServerId;
  // Picking another channel in the same space closes it (a switch to the
  // space itself, when the page was opened from elsewhere, does not).
  const catalystOpenedAt = useRef(0);
  const catalystWhereRef = useRef({ server: app.activeServerId, channel: app.activeChannelId });
  useEffect(() => {
    const prev = catalystWhereRef.current;
    const settling = Date.now() - catalystOpenedAt.current < 2000;
    if (!settling && prev.server === app.activeServerId && prev.channel !== app.activeChannelId && prev.channel) setCatalystServerId(null);
    catalystWhereRef.current = { server: app.activeServerId, channel: app.activeChannelId };
  }, [app.activeServerId, app.activeChannelId]);
  const { plan: subPlan, entitlements } = useSubscription(app.user?.id);

  // Back from connecting YouTube, TikTok or Twitch: open the Creator Program
  // tab, which reads the result from the same query string.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("creator")) return;
    setSettingsInitialTab("creator");
    setSettingsOpen(true);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Payment-failure emails (and the lapsed-theme notice) link straight to
    // Settings → Subscription, where "Manage billing" opens the Stripe portal
    // and lets the member replace the declined card.
    // "account" is where the desktop app sends people to add a passkey,
    // which only works on disband.dev.
    const settingsTab = params.get("settings");
    if (settingsTab === "subscriptions" || settingsTab === "account") {
      setSettingsInitialTab(settingsTab);
      setSettingsOpen(true);
      params.delete("settings");
      const query = params.toString();
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}`,
      );
    }
    if (params.get("redirect_status") === "succeeded") {
      setCheckoutSuccess(true);
      window.history.replaceState({}, "", window.location.pathname);
    }
    // Shop purchase return (Stripe `return_url` lands on /app?shop=<id>).
    // The webhook grants ownership and can lag the redirect by seconds, so
    // wait for the owned row before opening the shop — otherwise the item
    // still shows Buy instead of Owned.
    const purchasedId = params.get("shop");
    if (purchasedId) {
      window.history.replaceState({}, "", window.location.pathname);
      const item = shopItem(purchasedId);
      if (item) {
        let cancelled = false;
        void (async () => {
          for (let i = 0; i < 15 && !cancelled; i++) {
            try {
              const res = await apiFetch("/api/shop/equip");
              const data = (await res.json()) as { owned?: string[] };
              if (res.ok && (data.owned ?? []).includes(item.id)) break;
            } catch {
              // Keep polling; the webhook may not have landed yet.
            }
            await new Promise((r) => setTimeout(r, 2000));
          }
          if (cancelled) return;
          setShopCategory(item.category);
          setShopPurchase(item.name);
          setShopOpen(true);
        })();
        return () => { cancelled = true; };
      }
    }

    // Gift purchase return (Stripe `return_url` lands on /app?gift=<code>).
    // The webhook flips the gift from pending to unclaimed and can lag the
    // redirect, so wait for the row to go live before saying it's ready.
    const boughtGiftCode = params.get("gift");
    if (boughtGiftCode) {
      window.history.replaceState({}, "", window.location.pathname);
      let cancelled = false;
      void (async () => {
        for (let i = 0; i < 15 && !cancelled; i++) {
          try {
            const res = await apiFetch("/api/gifts/mine");
            const data = (await res.json()) as { sent?: Array<{ code?: string; status?: string }> };
            const row = (data.sent ?? []).find((g) => g.code === boughtGiftCode);
            if (row && row.status !== "pending") break;
          } catch {
            // Keep polling; the webhook may not have landed yet.
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
        if (!cancelled) setGiftReturn(boughtGiftCode);
      })();
      return () => { cancelled = true; };
    }
  }, []);

  useEffect(() => {
    if (!shopPurchase) return;
    const timer = setTimeout(() => setShopPurchase(null), 8000);
    return () => clearTimeout(timer);
  }, [shopPurchase]);

  useEffect(() => {
    if (!giftReturn) return;
    const timer = setTimeout(() => setGiftReturn(null), 12000);
    return () => clearTimeout(timer);
  }, [giftReturn]);

  useEffect(() => {
    if (!checkoutSuccess) return;
    const timer = setTimeout(() => setCheckoutSuccess(false), 6000);
    return () => clearTimeout(timer);
  }, [checkoutSuccess]);

  useEffect(() => {
    if (entitlements) {
      app.setMaxMessageChars(entitlements.maxMessageChars);
      app.setMaxBioLength(entitlements.maxBioLength);
    }
  }, [entitlements, app.setMaxMessageChars, app.setMaxBioLength]);

  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const channelChatRef = useRef<ChatCanvasHandle>(null);
  const dmChatRef = useRef<ChatCanvasHandle>(null);
  const groupChatRef = useRef<ChatCanvasHandle>(null);
  const notesChatRef = useRef<ChatCanvasHandle>(null);
  const isMobile = useIsMobile();
  const [zoom, setZoom] = useZoom();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "=" || key === "+") {
        e.preventDefault();
        setZoom((z) => z + ZOOM_STEP);
      } else if (key === "-") {
        e.preventDefault();
        setZoom((z) => z - ZOOM_STEP);
      } else if (key === "0") {
        e.preventDefault();
        setZoom(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setZoom]);

  useEffect(() => {
    if (app.activeDmThreadId) {
      void app.loadPinnedMessages("dm", app.activeDmThreadId);
    }
  }, [app.activeDmThreadId, app.loadPinnedMessages]);

  useEffect(() => {
    if (app.activeChannelId) {
      void app.loadPinnedMessages("channel", app.activeChannelId);
    }
  }, [app.activeChannelId, app.loadPinnedMessages]);

  useEffect(() => {
    if (isMobile) setMobileMenuOpen(false);
  }, [
    isMobile,
    app.viewMode,
    app.activeChannelId,
    app.activeServerId,
    app.activeDmThreadId,
    app.activeGroupChatId,
  ]);

  const call = useCallManager(
    app.user?.id ?? null,
    app.profile,
    app.micMuted,
    app.deafened,
    app.isBlockedEitherWay,
    subPlan,
  );

  useEffect(() => {
    app.setCallPhase(call.phase);
  }, [call.phase, app.setCallPhase]);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "default") return;
    const ask = () => {
      void requestNotificationPermissionFromGesture();
    };
    window.addEventListener("pointerdown", ask, { once: true });
    return () => window.removeEventListener("pointerdown", ask);
  }, []);

  const groupCall = useGroupCallManager(
    app.user?.id ?? null,
    app.profile,
    app.micMuted,
    app.deafened,
    subPlan,
  );

  useEffect(() => {
    const el = remoteAudioRef.current;
    if (el && call.remoteStream) {
      el.srcObject = call.remoteStream;
      el.muted = app.deafened;
      void applyAudioOutputToElement(el, getPreferredAudioOutputId());
      void el.play().catch(() => {});
    }
  }, [call.remoteStream, app.deafened]);

  const activeChannel = app.channels.find((c) => c.id === app.activeChannelId);

  useEffect(() => {
    if (app.viewMode !== "space") return;
    const serverId = app.activeServerId;
    if (!serverId || app.activeChannelId || app.channels.length === 0) return;

    const serverChannels = app.channels.filter(c => c.server_id === serverId);
    const savedId = getLastChannelId(serverId);
    const target =
      (savedId ? serverChannels.find((c) => c.id === savedId) : undefined)
      ?? serverChannels.find((c) => c.type === "text" && !c.parent_id)
      ?? serverChannels.find((c) => !c.parent_id)
      ?? serverChannels[0];
    if (target) app.selectChannel(target.id);
  }, [app.viewMode, app.activeServerId, app.activeChannelId, app.channels, app.selectChannel]);
  const isVoice = activeChannel?.type === "voice";
  // A forum post renders as a chat with a way back to its forum.
  const activeParentForum = activeChannel?.parent_id
    ? app.channels.find((c) => c.id === activeChannel.parent_id) ?? null
    : null;
  const lastOwnChannelMessageAt = useMemo(() => {
    const me = app.user?.id;
    if (!me) return null;
    for (let i = app.messages.length - 1; i >= 0; i--) {
      const m = app.messages[i];
      if (m.author_id === me && !m.sending) return m.created_at;
    }
    return null;
  }, [app.messages, app.user?.id]);
  const dmFriend =
    app.dmThreads.find((t) => t.id === app.activeDmThreadId)?.friend ??
    (() => {
      const thread = app.dmThreads.find((t) => t.id === app.activeDmThreadId);
      if (!thread || !app.user?.id) return undefined;
      const peerId = thread.user_a === app.user.id ? thread.user_b : thread.user_a;
      return app.friends.find((f) => f.id === peerId);
    })();
  const activeGroup = app.groupChats.find((g) => g.id === app.activeGroupChatId);
  // Group chats with unread messages get a picture in the rail, like DMs.
  const groupRailUnreads = useMemo(
    () =>
      app.groupChats
        .map((group) => ({ group, count: app.groupUnreadMap.get(group.id) ?? 0 }))
        .filter((e) => e.count > 0)
        .sort((a, b) => (b.group.last_message_at ?? "").localeCompare(a.group.last_message_at ?? "")),
    [app.groupChats, app.groupUnreadMap],
  );

  // Stable member lists for ChatCanvas. Built inline in JSX these arrays got a
  // fresh identity on every DiscordApp render, which re-ran the canvas's member
  // memo and re-rendered every message row. Memoizing them lets row
  // memoization actually hold while presence/notifications churn the context.
  const channelMembers = useMemo(() => app.members.map((m) => m.profile), [app.members]);
  const dmMembers = useMemo(
    () => (dmFriend ? [dmFriend, ...(app.profile ? [app.profile] : [])] : []),
    [dmFriend, app.profile],
  );
  const notesMembers = useMemo(() => (app.profile ? [app.profile] : []), [app.profile]);

  const mobileTitle = useMemo(() => {
    switch (app.viewMode) {
      case "home":
        return "Home";
      case "notes":
        return "Notes";
      case "dm":
        return dmFriend ? displayName(dmFriend) : "Messages";
      case "group":
        return activeGroup?.name ?? "Group";
      case "space":
        return activeChannel ? `#${activeChannel.name}` : (app.activeServer?.name ?? "Space");
      default:
        return "Disband";
    }
  }, [app.viewMode, dmFriend, activeGroup, activeChannel, app.activeServer?.name]);

  const toggleMic = () => app.setMicMuted(!app.micMuted);
  const toggleDeafen = () => {
    const next = !app.deafened;
    app.setDeafened(next);
    if (next) app.setMicMuted(true);
  };

  const dmCallActive = call.phase === "outgoing" || call.phase === "active";
  const groupCallActive = groupCall.joined;
  const groupVoiceLive =
    groupCall.presence.length > 0 && groupCall.groupId === activeGroup?.id;
  const callBannerPeer = call.activePeer ?? dmFriend;

  useEffect(() => {
    if (activeGroup) void groupCall.watchGroup(activeGroup.id, activeGroup.name);
    else void groupCall.watchGroup(null);
  }, [activeGroup?.id, activeGroup?.name, groupCall.watchGroup]);

  const serverVoicePresence = useServerVoicePresence(app.activeServerId);

  const canKick = app.serverPermissions.kick;
  const canBan = app.serverPermissions.ban;
  const myServerTimeout = app.user
    ? app.serverTimeouts.find((t) => t.user_id === app.user!.id && Date.parse(t.expires_at) > Date.now())
    : undefined;
  const myTimeoutLabel = myServerTimeout
    ? (() => {
        const mins = Math.max(1, Math.ceil((Date.parse(myServerTimeout.expires_at) - Date.now()) / 60000));
        return mins >= 1440
          ? `${Math.floor(mins / 1440)}d ${Math.floor((mins % 1440) / 60)}h`
          : mins >= 60
            ? `${Math.floor(mins / 60)}h ${mins % 60}m`
            : `${mins}m`;
      })()
    : null;
  const canManageRoles = app.serverPermissions.manage_roles;
  const canManageChannels = app.serverPermissions.manage_channels;
  const isServerOwner = app.activeServer?.owner_id === app.user?.id;
  const visibleChannels = useMemo(() => {
    if (canManageChannels) return app.channels;
    return app.channels.filter((c) => app.channelEffects[c.id]?.can_view ?? true);
  }, [app.channels, app.channelEffects, canManageChannels]);
  const activeChannelEffect = activeChannel ? app.channelEffects[activeChannel.id] : undefined;
  const loadedProfileMember = profileTarget
    ? app.members.find((m) => m.user_id === profileTarget.id)
    : undefined;
  // Bumped after a role edit so a fetched membership row re-reads its roles.
  const [profileMemberRefresh, setProfileMemberRefresh] = useState(0);
  const { row: fetchedProfileMember, pending: profileMemberPending } = useProfileMember(
    app.viewMode === "space" ? app.activeServerId : null,
    profileTarget?.id,
    !!loadedProfileMember,
    profileMemberRefresh,
  );
  // Prefer a freshly fetched row (it reflects the latest role edit), then the
  // loaded roster, which on big spaces holds only part of the members.
  const profileServerMember = fetchedProfileMember ?? loadedProfileMember;
  const profileIsSelf = !!profileTarget && profileTarget.id === app.user?.id;
  const profileCanManageRoles =
    app.viewMode === "space" &&
    !!profileTarget &&
    (
      isServerOwner ||
      (app.serverPermissions.manage_roles &&
        app.serverPermissions.manage_server &&
        (profileIsSelf || app.canModerateMember(profileTarget.id)))
    )
    // Only the owner can change the owner's roles (0228).
    && (profileIsSelf || profileTarget.id !== app.activeServer?.owner_id);
  const assignableServerRoles = useMemo(
    () => app.serverRoles.filter((role) => !role.is_default && (isServerOwner || role.position < app.myTopRolePosition)),
    [app.serverRoles, app.myTopRolePosition, isServerOwner],
  );

  const getAuthorColor = useCallback(
    (authorId: string) => {
      const member = app.members.find((m) => m.user_id === authorId);
      if (member) return app.getMemberColor(member) ?? undefined;
      return undefined;
    },
    [app],
  );

  const getAuthorIconRole = useCallback(
    (authorId: string) => {
      const member = app.members.find((m) => m.user_id === authorId);
      return member ? app.getMemberIconRole(member) : null;
    },
    [app],
  );

  const openProfile = useCallback((profile: Profile) => {
    const recent = lastPointer.current && Date.now() - lastPointer.current.at < 1500 ? lastPointer.current.rect : null;
    setProfileAnchor(recent);
    setProfileFull(!recent);
    setProfileTarget(profile);
  }, []);

  // The call stage's right-click menu (CallStage.tsx) asks for these.
  const openDmWithFriend = app.openDmWithFriend;
  useEffect(() => {
    const onProfile = (e: Event) => {
      const profile = (e as CustomEvent<Profile>).detail;
      if (profile?.id) openProfile(profile);
    };
    const onDm = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (typeof id === "string") void openDmWithFriend(id);
    };
    window.addEventListener("disband:open-profile", onProfile);
    window.addEventListener("disband:open-dm", onDm);
    return () => {
      window.removeEventListener("disband:open-profile", onProfile);
      window.removeEventListener("disband:open-dm", onDm);
    };
  }, [openProfile, openDmWithFriend]);

  const handleAuthorClick = useCallback(
    (author: Profile) => {
      if (author.id === app.user?.id && app.profile) openProfile(app.profile);
      else openProfile(author);
    },
    [app.user?.id, app.profile, openProfile],
  );

  const handleSelectChannel = useCallback(
    (channelId: string) => {
      app.selectChannel(channelId);
    },
    [app],
  );

  const setSpaceBadge = useCallback(
    async (serverId: string, patch: Partial<Pick<Server, "partner" | "verified">>) => {
      try {
        const res = await apiFetch("/api/admin/space-badges", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ serverId, ...patch }),
        });
        if (!res.ok) {
          const json = (await res.json().catch(() => null)) as { error?: string } | null;
          void alertDialog(json?.error ?? t("Could not update the space badge."));
          return;
        }
        await app.refreshAll();
      } catch {
        void alertDialog(t("Could not reach the server. Try again."));
      }
    },
    [app],
  );

  const handleServerContext = useCallback(
    (server: Server, x: number, y: number) => {
      const isOwner = server.owner_id === app.user?.id;
      const inFolder = app.serverFolders.find((f) =>
        app.serverListState.some((s) => s.server_id === server.id && s.folder_id === f.id),
      );
      const inviteCode = server.vanity_code || server.invite_code;
      const hasUnread = app.serverUnreadIds.includes(server.id);
      const items: ContextMenuItem[] = [
        {
          id: "mark-read",
          label: t("Mark as Read"),
          icon: <IconCheckAll size={16} />,
          disabled: !hasUnread,
          onClick: () => void app.markServerRead(server.id),
        },
        {
          id: "notifications",
          label: t("Notification Settings"),
          icon: <IconBell size={16} />,
          onClick: () => setNotifySpace(server),
        },
        { id: "sep-notify", label: "", separator: true },
        // Inviting comes first, as it does on Discord: the short link, never the raw space ID.
        ...(inviteCode
          ? [
              {
                id: "invite-people",
                label: t("Invite People"),
                icon: <IconUserPlus size={16} />,
                onClick: () => setInviteSpace(server),
              } as ContextMenuItem,
              {
                id: "invite",
                label: t("Copy Invite Link"),
                icon: <IconLink size={16} />,
                onClick: () => void navigator.clipboard.writeText(getInviteUrl(inviteCode)),
              } as ContextMenuItem,
            ]
          : []),
        ...(app.profile?.show_owner_badge
          ? [
              {
                id: "partner-badge",
                label: server.partner ? t("Remove Partner Badge") : t("Mark as Partner"),
                icon: <IconStar size={16} />,
                onClick: () => void setSpaceBadge(server.id, { partner: !server.partner }),
              } as ContextMenuItem,
              {
                id: "verified-badge",
                label: server.verified ? t("Remove Verified Badge") : t("Mark as Verified"),
                icon: <IconVerified size={16} />,
                onClick: () => void setSpaceBadge(server.id, { verified: !server.verified }),
              } as ContextMenuItem,
            ]
          : []),
        {
          id: "settings",
          label: t("Space Settings"),
          icon: <IconSettings size={16} />,
          onClick: () => setServerSettingsOpen(true),
        },
          ...[
            {
              id: "boost",
              label: t("Boost Space"),
              icon: <IconStar size={16} />,
              onClick: () => void boostServer(server.id),
            } as ContextMenuItem,
          ],
        {
          id: "copy-id",
          label: t("Copy Space ID"),
          icon: <IconCopy size={16} />,
          onClick: () => void navigator.clipboard.writeText(server.id),
        },
        ...(server.owner_id !== app.user?.id
          ? [{
              id: "report",
              label: t("Report Space"),
              icon: <IconShield size={16} />,
              danger: true,
              onClick: () => setReportTarget({ kind: "server", server: { id: server.id, name: server.name } }),
            } as ContextMenuItem]
          : []),
        {
          id: "leave",
          label: t("Leave Space"),
          icon: <IconLeave size={16} />,
          onClick: () => void app.leaveServer(server.id),
        },
        ...(inFolder
          ? [
              {
                id: "unfolder",
                label: t("Remove from {name}", { name: inFolder.name }),
                icon: <IconFolderMinus size={16} />,
                onClick: () => {
                  const state = app.serverListState.find((s) => s.server_id === server.id);
                  void app.setServerSlot(server.id, state?.position ?? 9999, null);
                },
              } as ContextMenuItem,
            ]
          : []),
        ...app.serverFolders
          .filter((f) => f.id !== inFolder?.id)
          .map((f) => ({
            id: `move-folder-${f.id}`,
            label: t("Move to {name}", { name: f.name }),
            icon: <IconFolder size={16} />,
            onClick: () => {
              const members = app.serverListState.filter((s) => s.folder_id === f.id);
              void app.setServerSlot(server.id, members.length, f.id);
            },
          }) as ContextMenuItem),
        {
          id: "new-folder",
          label: t("Create Folder with Space"),
          icon: <IconFolderPlus size={16} />,
          onClick: () => {
            setPendingFolderServer(server);
            setFolderDialog({ mode: "create", folderId: null });
          },
        },
        ...(isOwner
          ? [
              {
                id: "delete",
                label: t("Delete Space"),
                icon: <IconTrash size={16} />,
                danger: true,
                onClick: () => {
                  void confirmDialog({
                    title: t("Delete {name}", { name: server.name }),
                    body: t("This deletes the space, its channels and messages for everyone. It can't be undone."),
                    confirmLabel: t("Delete Space"),
                    action: () => app.deleteServer(server.id),
                  });
                },
              },
            ]
          : []),
      ];
      openMenu(x, y, items);
    },
    [app, openMenu, subPlan, setSpaceBadge],
  );

  const handleFolderContext = useCallback(
    (folder: ServerFolder, x: number, y: number) => {
      openMenu(x, y, [
        {
          id: "rename",
          label: t("Rename Folder"),
          icon: <IconEdit size={16} />,
          onClick: () => {
            setPendingFolderServer(null);
            setFolderDialog({ mode: "edit", folderId: folder.id });
          },
        },
        {
          id: "delete",
          label: t("Delete Folder"),
          icon: <IconTrash size={16} />,
          danger: true,
          onClick: () => {
            void confirmDialog({
              title: t("Delete {name}", { name: folder.name }),
              body: "The folder goes; the spaces in it stay where they are.",
              confirmLabel: t("Delete Folder"),
              action: () => app.deleteFolder(folder.id),
            });
          },
        },
      ]);
    },
    [app, openMenu],
  );

  const handleReorderServers = useCallback(
    (slots: { server_id: string; position: number; folder_id: string | null }[]) => {
      if (!slots.length) return;
      void app.reorderServers(slots).then((err) => {
        if (err) void app.loadServerOrganization();
      });
    },
    [app],
  );

  const handleReorderFolders = useCallback(
    (orderedIds: string[]) => {
      void app.reorderFolders(orderedIds);
    },
    [app],
  );

  const boostServer = useCallback(
    (serverId: string) => {
      // The Catalyst page fills that space's chat area.
      catalystOpenedAt.current = Date.now();
      if (app.activeServerId !== serverId || app.viewMode !== "space") void app.selectServer(serverId);
      setCatalystServerId(serverId);
    },
    [app],
  );

  // "Add to Favorites" for any menu that names a channel or conversation.
  const favoriteMenuItem = useCallback((kind: FavoriteKind, id: string): ContextMenuItem[] => {
    const userId = app.user?.id;
    if (!userId || !favoritesAvailable()) return [];
    const on = isFavorite(kind, id);
    return [{
      id: "favorite",
      label: on ? t("Remove from Favorites") : t("Add to Favorites"),
      icon: <IconStar size={16} />,
      onClick: () => {
        void toggleFavorite(userId, kind, id).then((err) => {
          if (err) void alertDialog(err, t("Favorites"));
        });
      },
    }];
  }, [app.user?.id, t]);

  const handleChannelContext = useCallback(
    (channel: Channel, x: number, y: number) => {
      const items: ContextMenuItem[] = [
        ...favoriteMenuItem("channel", channel.id),
        {
          id: "copy",
          label: t("Copy Channel ID"),
          icon: <IconCopy size={16} />,
          onClick: () => void navigator.clipboard.writeText(channel.id),
        },
      ];
      if (canManageChannels) {
        items.push(
          {
            id: "settings",
            label: t("Edit Channel"),
            icon: <IconEdit size={16} />,
            onClick: () => setChannelSettingsChannel(channel),
          },
          {
            id: "delete",
            label: t("Delete Channel"),
            icon: <IconTrash size={16} />,
            danger: true,
            onClick: () => {
              void confirmDialog({
                title: t("Delete #{name}", { name: channel.name }),
                body: t("Its messages go with it. This can't be undone."),
                confirmLabel: t("Delete Channel"),
                action: () => app.deleteChannel(channel.id),
              });
            },
          },
        );
      }
      openMenu(x, y, items);
    },
    [openMenu, canManageChannels, app, favoriteMenuItem],
  );

  const handleCategoryContext = useCallback(
    (category: ChannelCategory, x: number, y: number) => {
      const items: ContextMenuItem[] = [
        {
          id: "copy-id",
          label: t("Copy Category ID"),
          icon: <IconCopy size={16} />,
          onClick: () => void navigator.clipboard.writeText(category.id),
        },
        {
          id: "copy-server-id",
          label: t("Copy Space ID"),
          icon: <IconCopy size={16} />,
          onClick: () => void navigator.clipboard.writeText(category.server_id),
        },
      ];
      if (canManageChannels) {
        items.push(
          {
            id: "add-channel",
            label: t("Create Channel"),
            icon: <IconPlus size={16} />,
            onClick: () => setCreateChannelTarget({ categoryId: category.id }),
          },
          {
            id: "rename",
            label: t("Rename Category"),
            icon: <IconEdit size={16} />,
            onClick: () => {
              void promptDialog({
                title: t("Rename Category"),
                label: t("Category name"),
                defaultValue: category.name,
              }).then((name) => {
                if (name?.trim()) void app.renameCategory(category.id, name.trim());
              });
            },
          },
          {
            id: "delete",
            label: t("Delete Category"),
            icon: <IconTrash size={16} />,
            danger: true,
            onClick: () => {
              void confirmDialog({
                title: t("Delete {name}", { name: category.name }),
                body: t("The channels inside are kept and moved out of the category."),
                confirmLabel: t("Delete Category"),
                action: () => app.deleteCategory(category.id),
              });
            },
          },
        );
      }
      openMenu(x, y, items);
    },
    [openMenu, canManageChannels, app],
  );

  const startGroupVoiceCall = useCallback(() => {
    if (!activeGroup || !app.user) return;
    const memberIds = activeGroup.members.map((m) => m.id);
    void groupCall.startGroupCall(activeGroup.id, activeGroup.name, memberIds);
  }, [activeGroup, app.user, groupCall]);

  const handleForward = useCallback(
    (dest: ForwardDestination) => {
      const msg = forwardMessage;
      if (!msg) return;
      const prefix = msg.author
        ? `[Forwarded from ${displayName(msg.author as any)}]\n`
        : "[Forwarded]\n";
      const content = prefix + (msg.content || "(attachment)");
      if (dest.kind === "dm") {
        void app.openDmWithFriend(dest.id).then(() => {
          setTimeout(() => {
            void app.sendDmMessage(content);
          }, 200);
        });
      } else if (dest.kind === "group") {
        void app.selectGroupChat(dest.id).then(() => {
          setTimeout(() => {
            void app.sendGroupMessage(content);
          }, 200);
        });
      }
      setForwardMessage(null);
    },
    [forwardMessage, app],
  );

  const handleNoteContext = useCallback(
    (message: ChatMessageData, x: number, y: number) => {
      const isPinned = app.notes.find((n) => n.id === message.id)?.pinned ?? false;
      openMenu(x, y, [
        {
          id: "pin",
          label: isPinned ? t("Unpin note") : t("Pin note"),
          icon: isPinned ? <IconPinOff size={16} /> : <IconPin size={16} />,
          onClick: () => void app.toggleNotePinned(message.id),
        },
        {
          id: "copy-id",
          label: t("Copy Note ID"),
          icon: <IconCopy size={16} />,
          onClick: () => void navigator.clipboard.writeText(message.id),
        },
        {
          id: "reply",
          label: t("Reply to note"),
          icon: <IconNotes size={16} />,
          onClick: () =>
            notesChatRef.current?.setReplyTo({
              id: message.id,
              author_id: message.author_id,
              content: message.content,
              attachment_type: message.attachment_type,
            }),
        },
        ...(normalizeMessageContent(message.content)
          ? [
              {
                id: "edit",
                label: t("Edit note"),
                icon: <IconSettings size={16} />,
                onClick: () =>
                  notesChatRef.current?.setEditing({ id: message.id, content: message.content }),
              },
              {
                id: "copy",
                label: t("Copy text"),
                icon: <IconCopy size={16} />,
                onClick: () => void navigator.clipboard.writeText(message.content),
              },
            ]
          : []),
        {
          id: "delete",
          label: t("Delete note"),
          icon: <IconTrash size={16} />,
          danger: true,
          onClick: () => {
            void confirmDialog({
              title: t("Delete Note"),
              body: t("This can't be undone."),
              confirmLabel: t("Delete"),
              action: () => app.deleteNote(message.id),
            });
          },
        },
      ]);
    },
    [app, openMenu],
  );

  const handleMessageContext = useCallback(
    (message: ChatMessageData, x: number, y: number, context: MessageContext) => {
      const isOwn = message.author_id === app.user?.id;
      const canModerateMessages =
        app.viewMode === "space"
        && (app.activeServer?.owner_id === app.user?.id || !!app.serverPermissions.manage_messages);
      const chatRef =
        context === "dm" ? dmChatRef : context === "group" ? groupChatRef : channelChatRef;
      const pinnedForSource = app.activeDmThreadId
        ? app.pinnedBySource[`dm:${app.activeDmThreadId}`]
        : context === "channel" && app.activeChannelId
          ? app.pinnedBySource[`channel:${app.activeChannelId}`]
          : undefined;
      const isPinned = pinnedForSource?.some((p) => p.message_id === message.id) ?? false;
      // Saving and reminders need a real, delivered message and its container.
      const savedContext = context === "notes" ? null : context;
      const containerId =
        context === "channel" ? app.activeChannelId : context === "dm" ? app.activeDmThreadId : context === "group" ? app.activeGroupChatId : null;
      const userId = app.user?.id;
      const canSave = !!savedContext && !!containerId && !!userId && !message.sending && !message.id.startsWith("opt-") && savedAvailable();
      const savedRow = canSave ? findSaved(savedContext!, message.id) : undefined;
      const saveItems: ContextMenuItem[] = canSave
        ? [
            {
              id: "save",
              label: savedRow ? t("Remove from saved") : t("Save message"),
              icon: <IconBookmark size={16} />,
              onClick: () => {
                const run = savedRow
                  ? unsaveMessage(userId!, savedRow.id)
                  : saveMessage(userId!, { context: savedContext!, messageId: message.id, containerId: containerId! });
                void run.then((err) => {
                  if (err) void alertDialog(err, t("Saved messages"));
                });
              },
            },
            {
              id: "remind",
              label: appearanceEntitled(app.subscriptionPlan) ? t("Remind me…") : t("Remind me… (Lite and Aero)"),
              icon: <IconAlarm size={16} />,
              onClick: () => {
                if (!appearanceEntitled(app.subscriptionPlan)) {
                  setSubscriptionOpen(true);
                  return;
                }
                setReminderTarget({ context: savedContext!, messageId: message.id, containerId: containerId! });
              },
            },
          ]
        : [];
      const canPin = app.activeServer?.owner_id === app.user?.id || !!app.serverPermissions.pin_messages;

      openMenu(x, y, [
        {
          id: "reply",
          label: t("Reply"),
          icon: <IconFriends size={16} />,
          onClick: () => {
            chatRef.current?.setReplyTo({
              id: message.id,
              author_id: message.author_id,
              content: message.content,
              attachment_type: message.attachment_type,
              author: toReplyAuthor(message.author),
            });
          },
        },
        {
          id: "react",
          label: t("Add Reaction"),
          icon: <IconCopy size={16} />,
          onClick: () => chatRef.current?.openReactionPicker(message.id, x, y),
        },
        ...saveItems,
        ...(context === "dm" && app.activeDmThreadId
          ? [
              {
                id: "pin",
                label: isPinned ? t("Unpin Message") : t("Pin Message"),
                icon: isPinned ? <IconPinOff size={16} /> : <IconPin size={16} />,
                onClick: () => {
                  if (isPinned) {
                    void app.unpinMessage("dm", app.activeDmThreadId!, message.id);
                  } else {
                    void app.pinMessage("dm", app.activeDmThreadId!, {
                      id: message.id,
                      author_id: message.author_id,
                      content: message.content,
                    });
                  }
                },
              },
            ]
          : []),
        ...(context === "channel" && app.activeChannelId && canPin
          ? [
              {
                id: "pin",
                label: isPinned ? t("Unpin Message") : t("Pin Message"),
                icon: isPinned ? <IconPinOff size={16} /> : <IconPin size={16} />,
                onClick: () => {
                  if (isPinned) {
                    void app.unpinMessage("channel", app.activeChannelId!, message.id);
                  } else {
                    void app.pinMessage("channel", app.activeChannelId!, {
                      id: message.id,
                      author_id: message.author_id,
                      content: message.content,
                    });
                  }
                },
              },
            ]
          : []),
        {
          id: "copy",
          label: t("Copy Text"),
          icon: <IconCopy size={16} />,
          disabled: !message.content,
          onClick: () => void navigator.clipboard.writeText(message.content),
        },
        {
          id: "copy-id",
          label: t("Copy Message ID"),
          icon: <IconCopy size={16} />,
          onClick: () => void navigator.clipboard.writeText(String(message.display_id ?? message.id)),
        },
        ...(context !== "notes" && !isOwn && message.author_id
          ? [
              {
                id: "report",
                label: t("Report Message"),
                icon: <IconShield size={16} />,
                onClick: () =>
                  setReportTarget({
                    kind: "message",
                    surface: context as "channel" | "dm" | "group",
                    message,
                  }),
              } as ContextMenuItem,
            ]
          : []),
        ...(isOwn && normalizeMessageContent(message.content)
          ? [
              {
                id: "edit",
                label: t("Edit Message"),
                icon: <IconSettings size={16} />,
                onClick: () =>
                  chatRef.current?.setEditing({ id: message.id, content: message.content }),
              },
            ]
          : []),

        ...(isOwn || (context === "channel" && canModerateMessages)
          ? [
              {
                id: "delete",
                label: t("Delete Message"),
                icon: <IconTrash size={16} />,
                danger: true,
                onClick: () => {
                  if (context === "group") void app.deleteGroupMessage(message.id);
                  else if (context === "dm") void app.deleteDmMessage(message.id);
                  else void app.deleteMessage(message.id);
                },
              },
            ]
          : []),
      ]);
    },
    [app, openMenu],
  );

  const handleGroupMemberContext = useCallback(
    (member: Profile, x: number, y: number) => {
      if (!activeGroup) return;
      const isOwner = activeGroup.owner_id === app.user?.id;
      const items: ContextMenuItem[] = [
        {
          id: "profile",
          label: t("View Profile"),
          icon: <IconFriends size={16} />,
          onClick: () => openProfile(member),
        },
        {
          id: "dm",
          label: t("Message"),
          icon: <IconFriends size={16} />,
          onClick: () => void app.openDmWithFriend(member.id),
        },
        {
          id: "copy",
          label: t("Copy User ID"),
          icon: <IconCopy size={16} />,
          onClick: () => void navigator.clipboard.writeText(member.id),
        },
      ];
      if (isOwner && member.id !== app.user?.id && member.id !== activeGroup.owner_id) {
        items.push({
          id: "remove",
          label: t("Remove {name}", { name: displayName(member) }),
          icon: <IconLeave size={16} />,
          danger: true,
          onClick: () => {
            void confirmDialog({
              title: t("Remove {name}", { name: displayName(member) }),
              body: t("They'll leave \"{name}\".", { name: activeGroup.name }),
              confirmLabel: t("Remove"),
              action: async () => {
                const err = await app.removeGroupMember(activeGroup.id, member.id);
                if (err) void alertDialog(err);
                else await app.refreshGroupChats();
              },
            });
          },
        });
      }
      openMenu(x, y, items);
    },
    [activeGroup, app, openMenu, openProfile],
  );

  const handleGroupContext = useCallback(
    (group: NonNullable<typeof activeGroup>, x: number, y: number) => {
      const isOwner = group.owner_id === app.user?.id;
      const userId = app.user?.id;
      const pinned = !!pinnedAt("group", group.id);
      openMenu(x, y, [
        ...(userId && pinsAvailable()
          ? [{
              id: "pin",
              label: pinned ? t("Unpin") : t("Pin to top"),
              icon: pinned ? <IconPinOff size={16} /> : <IconPin size={16} />,
              onClick: () => void togglePin(userId, "group", group.id),
            }]
          : []),
        ...favoriteMenuItem("group", group.id),
        {
          id: "call",
          label: groupCall.joined ? t("In voice") : t("Start voice call"),
          icon: <IconPhone size={16} />,
          disabled: groupCall.joined || call.phase !== "idle",
          onClick: startGroupVoiceCall,
        },
        {
          id: "invite",
          label: t("Invite friends"),
          icon: <IconFriends size={16} />,
          onClick: () => {
            setInviteGroupId(group.id);
            setInviteGroupOpen(true);
          },
        },
        {
          id: "copy-id",
          label: t("Copy Group ID"),
          icon: <IconCopy size={16} />,
          onClick: () => void navigator.clipboard.writeText(group.id),
        },
        ...(isOwner
          ? [
              {
                id: "rename",
                label: t("Rename group"),
                icon: <IconSettings size={16} />,
                onClick: () => {
                  void promptDialog({
                    title: t("Rename Group"),
                    label: t("Group name"),
                    defaultValue: group.name,
                  }).then((next) => {
                    if (next?.trim()) void app.renameGroupChat(group.id, next.trim());
                  });
                },
              },
            ]
          : []),
        {
          id: "leave",
          label: t("Leave group"),
          icon: <IconLeave size={16} />,
          danger: true,
          onClick: () => {
            void confirmDialog({
              title: t("Leave {name}", { name: group.name }),
              body: t("You won't get its messages until someone adds you back."),
              confirmLabel: t("Leave Group"),
              action: async () => {
                if (groupCall.groupId === group.id && groupCall.joined) void groupCall.endGroupCall();
                await app.leaveGroupChat(group.id);
              },
            });
          },
        },
      ]);
    },
    [app, openMenu, groupCall.joined, call.phase, startGroupVoiceCall, favoriteMenuItem],
  );

  const handleUserPanelContext = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (!app.profile) return;
      openMenu(e.clientX, e.clientY, [
        {
          id: "settings",
          label: t("User Settings"),
          icon: <IconSettings size={16} />,
          onClick: () => setSettingsOpen(true),
        },
        {
          id: "copy-id",
          label: t("Copy User ID"),
          icon: <IconCopy size={16} />,
          onClick: () => void navigator.clipboard.writeText(app.profile!.id),
        },
      ]);
    },
    [app.profile, openMenu],
  );

  const handleMemberContext = useCallback(
    (member: (typeof app.members)[0], x: number, y: number) => {
      const isOwnerMember = member.role === "owner";
      const canModerateTarget = !isOwnerMember && member.user_id !== app.user?.id && app.canModerateMember(member.user_id);
      const items: ContextMenuItem[] = [
        {
          id: "profile",
          label: t("View Profile"),
          icon: <IconFriends size={16} />,
          onClick: () => openProfile(member.profile),
        },
        {
          id: "dm",
          label: t("Message"),
          icon: <IconFriends size={16} />,
          onClick: () => void app.openDmWithFriend(member.user_id),
        },
        {
          id: "copy",
          label: t("Copy User ID"),
          icon: <IconCopy size={16} />,
          onClick: () => void navigator.clipboard.writeText(member.user_id),
        },
      ];

      if (canModerateTarget) {
        if (canKick) {
          items.push({
            id: "kick",
            label: t("Kick"),
            icon: <IconLeave size={16} />,
            onClick: () => {
              void confirmDialog({
                title: t("Kick {name}", { name: displayName(member.profile) }),
                body: t("They can rejoin with an invite."),
                confirmLabel: t("Kick"),
                action: async () => {
                  const err = await app.kickMember(member.user_id);
                  if (err) void alertDialog(err);
                },
              });
            },
          });
        }
        if (canBan) {
          items.push({
            id: "ban",
            label: t("Ban"),
            icon: <IconTrash size={16} />,
            danger: true,
            onClick: () => {
              void confirmDialog({
                title: t("Ban {name}", { name: displayName(member.profile) }),
                body: t("This deletes all their messages and stops them rejoining."),
                confirmLabel: t("Ban"),
                action: async () => {
                  const err = await app.banMember(member.user_id);
                  if (err) void alertDialog(err);
                },
              });
            },
          });
        }
        if (app.serverPermissions.timeout_members || app.activeServer?.owner_id === app.user?.id) {
          const existing = app.serverTimeouts.find(
            (t) => t.user_id === member.user_id && Date.parse(t.expires_at) > Date.now(),
          );
          if (existing) {
            const mins = Math.max(1, Math.ceil((Date.parse(existing.expires_at) - Date.now()) / 60000));
            const remaining = mins >= 1440 ? `${Math.floor(mins / 1440)}d ${Math.floor((mins % 1440) / 60)}h` : mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
            items.push({
              id: "timeout-info",
              label: t("Timed out · {remaining} left", { remaining }),
              icon: <IconTimer size={16} />,
              disabled: true,
              onClick: () => {},
            });
            items.push({
              id: "timeout-remove",
              label: t("Remove Timeout"),
              icon: <IconTimer size={16} />,
              onClick: () => {
                void app.removeMemberTimeout(member.user_id).then((err) => { if (err) void alertDialog(err); });
              },
            });
          } else {
            items.push({
              id: "timeout",
              label: t("Time out…"),
              icon: <IconTimer size={16} />,
              onClick: () => {
                if (member.profile) setTimeoutTarget({ userId: member.user_id, profile: member.profile });
              },
            });
          }
        }
      }

      const assignableRoles = app.serverRoles.filter((r) => !r.is_default && (isServerOwner || r.position < app.myTopRolePosition));
      if (canManageRoles && assignableRoles.length > 0) {
        const memberRoleIds =
          member.role_ids && member.role_ids.length > 0
            ? member.role_ids
            : member.role_id
              ? [member.role_id]
              : [];
        assignableRoles.forEach((role) => {
          const isCurrent = memberRoleIds.includes(role.id);
          items.push({
            id: `role-${role.id}`,
            label: `${isCurrent ? "✓ " : ""}${role.name}`,
            icon: <IconSettings size={16} />,
            onClick: () => {
              const next = isCurrent
                ? memberRoleIds.filter((id) => id !== role.id)
                : [...memberRoleIds, role.id];
              void app.setMemberRoles(member.user_id, next).then((err) => {
                if (err) void alertDialog(err);
              });
            },
          });
        });
        if (memberRoleIds.length > 0) {
          items.push({
            id: "role-clear",
            label: t("Clear all roles"),
            icon: <IconClose size={16} />,
            onClick: () =>
              void app.setMemberRoles(member.user_id, []).then((err) => {
                if (err) void alertDialog(err);
              }),
          });
        }
      }

      openMenu(x, y, items);
    },
    [app, canKick, canBan, canManageRoles, isServerOwner, openMenu, openProfile],
  );

  // Right-clicking a message author. When they are a member of the server we
  // are viewing, this is the same menu as the member list, so moderation is
  // permission-gated in exactly one place. Otherwise (a DM, or someone who has
  // since left) it degrades to the profile actions only.
  const handleAuthorContext = useCallback(
    (profile: Profile, e: React.MouseEvent) => {
      const member = app.members.find((m) => m.user_id === profile.id);
      if (app.viewMode === "space" && member) {
        handleMemberContext(member, e.clientX, e.clientY);
        return;
      }
      openMenu(e.clientX, e.clientY, [
        {
          id: "profile",
          label: t("View Profile"),
          icon: <IconFriends size={16} />,
          onClick: () => openProfile(profile),
        },
        {
          id: "dm",
          label: t("Message"),
          icon: <IconFriends size={16} />,
          onClick: () => void app.openDmWithFriend(profile.id),
        },
        {
          id: "copy",
          label: t("Copy User ID"),
          icon: <IconCopy size={16} />,
          onClick: () => void navigator.clipboard.writeText(profile.id),
        },
      ]);
    },
    [app, handleMemberContext, openMenu, openProfile],
  );

  const handleFriendContext = useCallback(
    (friend: Profile, x: number, y: number) => {
      const items: ContextMenuItem[] = [
        {
          id: "profile",
          label: t("View Profile"),
          icon: <IconFriends size={16} />,
          onClick: () => openProfile(friend),
        },
        {
          id: "dm",
          label: t("Message"),
          icon: <IconFriends size={16} />,
          onClick: () => void app.openDmWithFriend(friend.id),
        },
        {
          id: "copy",
          label: t("Copy User ID"),
          icon: <IconCopy size={16} />,
          onClick: () => void navigator.clipboard.writeText(friend.id),
        },
        {
          id: "remove",
          label: t("Remove Friend"),
          icon: <IconLeave size={16} />,
          danger: true,
          onClick: () => {
            void confirmDialog({
              title: t("Remove {name}", { name: displayName(friend) }),
              body: t("They'll be removed from your friends."),
              confirmLabel: t("Remove Friend"),
              action: () => app.removeFriend(friend.id),
            });
          },
        },
        {
          id: "block",
          label: t("Block"),
          icon: <IconTrash size={16} />,
          danger: true,
          onClick: () => {
            void confirmDialog({
              title: t("Block {name}", { name: displayName(friend) }),
              body: t("They won't be able to message you."),
              confirmLabel: t("Block"),
              action: () => app.blockUser(friend.id),
            });
          },
        },
      ];
      openMenu(x, y, items);
    },
    [app, openMenu, openProfile],
  );

  const mapChatMessage = (m: {
    id: string;
    author_id: string | null;
    content: string;
    attachment_url: string | null;
    attachment_type: ChatMessageData["attachment_type"];
    attachment_name?: string | null;
    attachment_size?: number | null;
    attachments?: import("@/lib/message-attachments").StoredAttachment[] | null;
    display_id?: number;
    sending?: boolean;
    uploadProgress?: number;
    reply_to_id?: string | null;
    edited_at?: string | null;
    created_at: string;
    mentions?: string[];
    author?: Profile | null;
    embeds?: import("@/lib/embeds").Embed[] | null;
    webhook?: import("@/lib/embeds").MessageWebhookInfo | null;
    components?: ChatMessageData["components"];
    interaction?: ChatMessageData["interaction"];
    ephemeral_to?: string | null;
    reply_to_deleted?: boolean;
  }): ChatMessageData => ({
    id: m.id,
    author_id: m.author_id,
    content: m.content,
    attachment_url: m.attachment_url,
    attachment_type: m.attachment_type,
    attachment_name: m.attachment_name ?? null,
    attachment_size: m.attachment_size ?? null,
    // Rebuilding the row field-by-field silently drops anything not listed
    // here, which is what hid every extra attachment: a 5-image message
    // arrived at the renderer with only the legacy single-attachment columns.
    attachments: m.attachments ?? null,
    display_id: m.display_id,
    sending: m.sending,
    uploadProgress: m.uploadProgress,
    reply_to_id: m.reply_to_id ?? null,
    edited_at: m.edited_at ?? null,
    created_at: m.created_at,
    mentions: m.mentions ?? [],
    author: m.author ?? undefined,
    // Webhook and bot posts (GitHub, CI) carry their content in embeds; left
    // out here they reached the renderer as bare one-line text.
    embeds: m.embeds ?? null,
    webhook: m.webhook ?? null,
    // A bot's buttons, and who ran the command it answers ("kai used /fact").
    components: m.components ?? null,
    interaction: m.interaction ?? null,
    ephemeral_to: m.ephemeral_to ?? null,
    reply_to_deleted: m.reply_to_deleted ?? false,
  });

  const channelMessages = useMemo(
    () => app.messages.filter((m) => m.channel_id === app.activeChannelId).map(mapChatMessage),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [app.messages, app.activeChannelId],
  );
  const dmMessages = useMemo(
    () => app.dmMessages.map(mapChatMessage),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [app.dmMessages],
  );
  const groupMessages = useMemo(
    () => app.groupMessages.map(mapChatMessage),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [app.groupMessages],
  );

  const noteMessages: ChatMessageData[] = app.profile
    ? app.notes.map((n) =>
        mapChatMessage({
          id: n.id,
          author_id: n.user_id,
          content: n.content,
          attachment_url: n.attachment_url,
          attachment_type: n.attachment_type,
          attachment_name: n.attachment_name,
          attachment_size: n.attachment_size,
          reply_to_id: n.reply_to_id,
          edited_at: n.edited_at,
          created_at: n.created_at,
          author: app.profile!,
        }),
      )
    : [];
  const pinnedNoteIds = new Set(app.notes.filter((n) => n.pinned).map((n) => n.id));

  const profileFriend = profileTarget ? app.friends.some((f) => f.id === profileTarget.id) : false;
  const profileFriendship = profileTarget
    ? app.friendships.find(
        (f) =>
          (f.requester_id === app.user?.id && f.addressee_id === profileTarget.id) ||
          (f.requester_id === profileTarget.id && f.addressee_id === app.user?.id),
      )
    : undefined;
  const profilePendingIncoming =
    profileFriendship?.status === "pending" && profileFriendship.requester_id === profileTarget?.id;
  const profilePendingOutgoing =
    profileFriendship?.status === "pending" && profileFriendship.requester_id === app.user?.id;
  const profileIncomingRequestId =
    profilePendingIncoming && profileFriendship ? profileFriendship.id : null;

  const startVoiceCall = useCallback(
    (peer: Profile) => {
      void app.openDmWithFriend(peer.id);
      void call.startCall(peer);
    },
    [app, call],
  );

  const groupRemoteLabels = useMemo(() => {
    const map = new Map<string, string>();
    activeGroup?.members.forEach((m) => map.set(m.id, displayName(m)));
    return map;
  }, [activeGroup]);

  const groupRemoteProfiles = useMemo(() => {
    const map = new Map<string, Profile>();
    activeGroup?.members.forEach((m) => map.set(m.id, m));
    return map;
  }, [activeGroup]);

  const lastCallRef = useRef<{ kind: string; startedAt: number | null } | null>(null);
  useEffect(() => {
    const activeKind = dmCallActive ? "dm" : groupCall.joined ? "group" : app.voiceJoinedChannelId ? "voice" : null;
    if (!activeKind) {
      lastCallRef.current = null;
      setCallIndicatorState({ active: false, kind: null, label: "", startedAt: null, connected: false, hangup: null, focus: null });
      return;
    }
    const dmConnected = activeKind === "dm" && call.rtcConnected;
    const groupConnected = activeKind === "group" &&
      (groupCall.presence.filter((p) => p.user_id !== app.user?.id).length === 0 ||
        groupCall.connectedPeerIds.size > 0);
    // Voice channels decide this inside the indicator from the session.
    const connected = activeKind === "voice" ? true : activeKind === "dm" ? dmConnected : groupConnected;
    const previous = lastCallRef.current;
    const current = !previous || previous.kind !== activeKind
      ? { kind: activeKind, startedAt: connected ? Date.now() : null }
      : previous;
    if (connected && current.startedAt === null) current.startedAt = Date.now();
    lastCallRef.current = current;
    const label =
      activeKind === "dm" && callBannerPeer
        ? `Call with ${displayName(callBannerPeer)}`
        : activeKind === "group" && activeGroup
          ? `In ${activeGroup.name}`
          : activeKind === "voice"
            ? `In ${activeChannel?.name ?? "voice"}`
            : "In a call";
    const hangup =
      activeKind === "dm"
        ? () => void call.endCall()
        : activeKind === "group"
          ? () => void groupCall.endGroupCall()
          : null;
    const gid = groupCall.groupId;
    const focus =
      activeKind === "dm" && callBannerPeer
        ? () => void app.openDmWithFriend(callBannerPeer.id)
        : activeKind === "group" && gid
          ? () => void app.selectGroupChat(gid)
          : null;
    setCallIndicatorState({
      active: true,
      kind: activeKind,
      label,
      startedAt: current.startedAt,
      connected,
      hangup,
      focus,
    });
  }, [
    dmCallActive,
    call.rtcConnected,
    groupCall.joined,
    groupCall.presence,
    groupCall.connectedPeerIds,
    app.voiceJoinedChannelId,
    app.user?.id,
    callBannerPeer,
    activeGroup,
    activeChannel,
    groupCall.groupId,
  ]);

  const renderCallPanel = () => {

    if (dmCallActive && callBannerPeer && dmFriend?.id === callBannerPeer.id) {
      return (
        <CallPanel
          peer={callBannerPeer}
          selfProfile={app.profile}
          title={displayName(callBannerPeer)}
          subtitle={call.phase === "outgoing" ? t("Calling… waiting for answer") : t("Connecting…")}
          phase={call.phase === "outgoing" ? "outgoing" : "active"}
          connected={call.rtcConnected}
          localStream={call.localStream}
          remoteStream={call.remoteStream}
          localScreen={call.localScreen}
          remoteScreen={call.remoteScreen}
          remoteScreenAudio={call.remoteScreenAudio}
          connectedAt={call.connectedAt}
          micMuted={app.micMuted}
          deafened={app.deafened}
          cameraEnabled={call.cameraEnabled}
          screenShareEnabled={call.screenShareEnabled}
          onToggleMic={toggleMic}
          onToggleDeafen={toggleDeafen}
          onToggleCamera={() => void call.toggleCamera()}
          onToggleScreenShare={() => void call.toggleScreenShare()}
          onEnd={() => void call.endCall()}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      );
    }
    return null;
  };

  // The Aero page lives in the home view's main column; leaving home (a
  // space, a DM, Discover) puts the friends page back for next time.
  const openAeroPage = useCallback(() => {
    setFavoritesView(false);
    app.setViewHome();
    setHomePage("aero");
    setMobileMenuOpen(false);
  }, [app]);
  const openFriendsPage = useCallback(() => {
    app.setViewHome();
    setHomePage("friends");
  }, [app]);
  useEffect(() => {
    if (app.viewMode !== "home") setHomePage("friends");
  }, [app.viewMode]);

  // Rail shortcuts. Downloads only on the web — the desktop app is the download.
  const railDownloads = isTauri() ? undefined : () => window.open("/downloads", "_blank", "noopener,noreferrer");
  const openHelpCentre = () => window.open("/support", "_blank", "noopener,noreferrer");

  // On phones a chat view carries the menu button in its own header, as
  // Discord did, instead of stacking a second bar above it.
  const mobileChatHeader =
    isMobile &&
    ((app.viewMode === "dm" && !!dmFriend) ||
      (app.viewMode === "group" && !!activeGroup) ||
      app.viewMode === "notes" ||
      (app.viewMode === "space" && !!activeChannel && !isVoice));
  const mobileMenuButton = isMobile ? (
    <button
      type="button"
      aria-label={t("Open navigation")}
      onClick={() => setMobileMenuOpen((v) => !v)}
      className="-ml-2 mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-interactive-normal hover:text-interactive-active"
    >
      <IconMenu size={22} />
    </button>
  ) : undefined;

  return (
    <div className="app-base-layer h-full w-full overflow-hidden bg-bg-primary">
      <AppearanceEffect userId={app.user?.id} plan={app.subscriptionPlan} />
      <div
        className="h-full w-full origin-top-left"
        style={{ transform: `scale(${zoom})`, width: `${100 / zoom}%`, height: `${100 / zoom}%` }}
      >
        <div className={`relative flex h-full w-full overflow-hidden ${isMobile && !mobileChatHeader ? "pt-10" : ""}`}>
      {isMobile && !mobileChatHeader && (
        <div className="absolute inset-x-0 top-0 z-[60] flex h-10 items-center gap-2 border-b border-divider bg-bg-tertiary px-2">
          <button
            type="button"
            aria-label={t("Open navigation")}
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-normal hover:bg-interactive-hover"
          >
            <IconMenu size={22} />
          </button>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-normal">
            {mobileTitle}
          </span>
          <NotificationBell compact />
          <button
            type="button"
            aria-label={t("Settings")}
            onClick={() => setSettingsOpen(true)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-interactive-hover hover:text-text-normal"
          >
            <IconSettings size={20} />
          </button>
        </div>
      )}

      {checkoutSuccess && (
        <div className="fixed left-0 right-0 top-0 z-[100] bg-[#57f287] px-4 py-2 text-center text-sm font-medium text-black">
          {t("Subscription activated successfully!")}
        </div>
      )}
      {shopPurchase && (
        <div className="fixed left-0 right-0 top-0 z-[100] bg-[#57f287] px-4 py-2 text-center text-sm font-medium text-black">
          {shopPurchase} is yours — equip it from the Shop.
        </div>
      )}
      {giftReturn && (
        <div className="fixed left-0 right-0 top-0 z-[100] flex items-center justify-center gap-3 bg-[#fee75c] px-4 py-2 text-center text-sm font-medium text-black">
          <span>{t("Your gift is ready — grab the link from Settings → Subscription.")}</span>
          <button
            type="button"
            onClick={() => {
              setGiftReturn(null);
              setSettingsInitialTab("subscriptions");
              setSettingsOpen(true);
            }}
            className="shrink-0 rounded bg-black px-2.5 py-1 text-xs font-bold text-[#fee75c]"
          >
            {t("Open settings")}
          </button>
        </div>
      )}

      {call.phase === "incoming" && call.incoming && (
        <IncomingCallOverlay
          callerName={call.incoming.callerName}
          profile={call.incoming.profile}
          onAccept={() => void call.acceptCall()}
          onReject={() => void call.rejectCall()}
        />
      )}

      {groupCall.incomingRing && (
        <GroupRingOverlay
          groupName={groupCall.incomingRing.groupName}
          onJoin={() => void groupCall.joinGroupCall(groupCall.incomingRing!.groupId, groupCall.incomingRing!.groupName)}
          onDismiss={groupCall.dismissRing}
        />
      )}

      {call.remoteStream && (
        <audio ref={remoteAudioRef} data-call-user={callBannerPeer?.id ?? undefined} autoPlay playsInline className="hidden" />
      )}

      {call.callNotice && (
        <div className="fixed bottom-6 left-1/2 z-[95] flex -translate-x-1/2 items-center gap-3 rounded-lg bg-bg-secondary px-4 py-3 text-sm shadow-[var(--elevation-high)]">
          <span>{call.callNotice}</span>
          {call.canRetryCall && (
            <button
              type="button"
              onClick={() => void call.retryCall()}
              className="shrink-0 rounded-md bg-brand px-2.5 py-1 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              {t("Retry")}
            </button>
          )}
        </div>
      )}
      {isMobile ? (
        mobileMenuOpen && (
          <div className="absolute inset-0 z-40">
            <div
              className="absolute inset-0 bg-overlay-scrim overlay-fade"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="relative flex h-full w-[min(88vw,22rem)] flex-col bg-bg-secondary shadow-[var(--elevation-high)]">
              <div className="flex min-h-0 flex-1">
              <ServerList
                servers={app.servers}
                catalystCounts={app.catalystCounts}
                activeServerId={app.activeServerId}
                viewMode={app.viewMode}
                dmUnreads={app.dmUnreads}
                activeDmThreadId={app.activeDmThreadId}
                groupUnreads={groupRailUnreads}
                activeGroupChatId={app.activeGroupChatId}
                onSelectGroupChat={(id) => void app.selectGroupChat(id)}
                serverUnreadIds={app.serverUnreadIds}
                serverMentionCounts={app.serverMentionCounts}
                folders={app.serverFolders}
                listState={app.serverListState}
                onSelectHome={() => { setFavoritesView(false); app.setViewHome(); }}
                onSelectServer={(id) => { setFavoritesView(false); void app.selectServer(id); }}
                onSelectDmThread={(id) => void app.selectDmThread(id)}
                onCreateServer={() => setCreateServerOpen(true)}
                onDiscover={() => { setFavoritesView(false); app.setViewDiscover(); }}
                favoritesActive={favoritesView}
                onSelectFavorites={() => setFavoritesView(true)}
                onServerContext={handleServerContext}
                onFolderContext={handleFolderContext}
                onReorderServers={handleReorderServers}
                onReorderFolders={handleReorderFolders}
                onOpenDownloads={railDownloads}
                onOpenHelp={openHelpCentre}
              />

              <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-bg-secondary">
              <div className="flex min-h-0 flex-1">
              {favoritesView ? (
                <div className="flex min-h-0 w-full"><FavoritesPanel /></div>
              ) : app.viewMode === "discover" ? (
                <DiscoverSidebar
                  tab={discoverTab}
                  onTabChange={setDiscoverTab}
                  onOpenSettings={() => setSettingsOpen(true)}
                  onOpenProfile={app.profile ? () => openProfile(app.profile!) : undefined}
                />
              ) : app.viewMode === "home" || app.viewMode === "dm" || app.viewMode === "group" || app.viewMode === "notes" ? (
                <HomePanel
                  onOpenSettings={() => setSettingsOpen(true)}
                  onOpenProfile={app.profile ? () => openProfile(app.profile!) : undefined}
                  onFriendClick={(id) => {
                    const f = app.friends.find((x) => x.id === id);
                    if (f) openProfile(f);
                  }}
                  onGroupContext={handleGroupContext}
                  onOpenSubscription={openAeroPage}
                  aeroActive={app.viewMode === "home" && homePage === "aero"}
                  onOpenFriends={openFriendsPage}
                  onOpenShop={() => setShopOpen(true)}
                    onOpenQuickSwitcher={() => setQuickSwitcherOpen(true)}
                />
              ) : (
                <ChannelList
                  title={app.activeServer?.name ?? t("Space")}
                  verified={app.activeServer?.verified}
                  partner={app.activeServer?.partner}
                  bannerUrl={app.activeServer?.banner_url ?? null}
                  categories={app.categories}
                  channels={visibleChannels}
                  activeChannelId={app.activeChannelId}
                  getUnreadCount={app.getChannelUnreadCount}
                  getMentionCount={app.getChannelMentionCount}
                  canManageChannels={canManageChannels}
                  voicePresence={serverVoicePresence.byChannel}
                  voiceStartTimes={serverVoicePresence.startTimes}
                  stageTopics={serverVoicePresence.stageTopics}
                  onSelectChannel={handleSelectChannel}
                  onOpenSettings={() => setSettingsOpen(true)}
                  onOpenProfile={app.profile ? () => openProfile(app.profile!) : undefined}
                  onOpenServerSettings={() => setServerSettingsOpen(true)}
                    onOpenServerMenu={app.activeServer ? (x, y) => handleServerContext(app.activeServer!, x, y) : undefined}
                  onChannelContext={handleChannelContext}
                  onCategoryContext={handleCategoryContext}
                  onMoveChannel={(channelId, categoryId, index) => void app.moveChannel(channelId, categoryId, index)}
                  onMoveCategory={(categoryId, index) => void app.moveCategory(categoryId, index)}
                  onCreateChannel={(name, type, categoryId) => app.createChannel({ name, type, categoryId })}
                  onCreateCategory={(name) => app.createCategory(name)}
                  catalystCount={app.activeServer ? app.catalystCounts[app.activeServer.id] ?? 0 : 0}
                  onOpenCatalysts={app.activeServer ? () => setCatalystServerId(app.activeServer!.id) : undefined}
                />
              )}
              </div>
              </div>
              </div>
              <CallIndicator />
              <UserPanel onOpenSettings={() => setSettingsOpen(true)} onOpenProfile={app.profile ? () => openProfile(app.profile!) : undefined} onContextMenu={handleUserPanelContext} />
            </div>
          </div>
        )
      ) : (
        <>
          {/* One sidebar block: the rail and the channel or DM list side by
              side, then the Voice Connected card and the user area running
              under both. The list has a definite width so long names and
              statuses truncate instead of widening the sidebar. */}
          <div className="relative flex h-full min-h-0 shrink-0 flex-col border-r border-column-border bg-bg-secondary">
            <div className="flex min-h-0 flex-1">
              <ServerList
                servers={app.servers}
                catalystCounts={app.catalystCounts}
                activeServerId={app.activeServerId}
                viewMode={app.viewMode}
                dmUnreads={app.dmUnreads}
                activeDmThreadId={app.activeDmThreadId}
                groupUnreads={groupRailUnreads}
                activeGroupChatId={app.activeGroupChatId}
                onSelectGroupChat={(id) => void app.selectGroupChat(id)}
                serverUnreadIds={app.serverUnreadIds}
                serverMentionCounts={app.serverMentionCounts}
                folders={app.serverFolders}
                listState={app.serverListState}
                onSelectHome={() => { setFavoritesView(false); app.setViewHome(); }}
                onSelectServer={(id) => { setFavoritesView(false); void app.selectServer(id); }}
                onSelectDmThread={(id) => void app.selectDmThread(id)}
                onCreateServer={() => setCreateServerOpen(true)}
                onDiscover={() => { setFavoritesView(false); app.setViewDiscover(); }}
                favoritesActive={favoritesView}
                onSelectFavorites={() => setFavoritesView(true)}
                onServerContext={handleServerContext}
                onFolderContext={handleFolderContext}
                onReorderServers={handleReorderServers}
                onReorderFolders={handleReorderFolders}
                onOpenDownloads={railDownloads}
                onOpenHelp={openHelpCentre}
              />

            <div className="flex h-full min-h-0 w-[256px] flex-col">
            <div className="flex min-h-0 flex-1">
              {favoritesView ? (
                <div className="flex min-h-0 w-full"><FavoritesPanel /></div>
              ) : app.viewMode === "discover" ? (
                <div className="flex min-h-0 w-full">
                  <DiscoverSidebar
                    tab={discoverTab}
                    onTabChange={setDiscoverTab}
                    onOpenSettings={() => setSettingsOpen(true)}
                    onOpenProfile={app.profile ? () => openProfile(app.profile!) : undefined}
                  />
                </div>
              ) : app.viewMode === "home" || app.viewMode === "dm" || app.viewMode === "group" || app.viewMode === "notes" ? (
                <div className="flex min-h-0 w-full">
                  <HomePanel
                    onOpenSettings={() => setSettingsOpen(true)}
                    onOpenProfile={app.profile ? () => openProfile(app.profile!) : undefined}
                    onFriendClick={(id) => {
                      const f = app.friends.find((x) => x.id === id);
                      if (f) openProfile(f);
                    }}
                    onGroupContext={handleGroupContext}
                    onOpenSubscription={openAeroPage}
                    aeroActive={app.viewMode === "home" && homePage === "aero"}
                    onOpenFriends={openFriendsPage}
                    onOpenShop={() => setShopOpen(true)}
                    onOpenQuickSwitcher={() => setQuickSwitcherOpen(true)}
                  />
                </div>
              ) : (
                <div className="flex min-h-0 w-full">
                  <ChannelList
                    title={app.activeServer?.name ?? t("Space")}
                    verified={app.activeServer?.verified}
                    partner={app.activeServer?.partner}
                    bannerUrl={app.activeServer?.banner_url ?? null}
                    categories={app.categories}
                    channels={app.channels}
                    activeChannelId={app.activeChannelId}
                    getUnreadCount={app.getChannelUnreadCount}
                    getMentionCount={app.getChannelMentionCount}
                    canManageChannels={canManageChannels}
                    voicePresence={serverVoicePresence.byChannel}
                    voiceStartTimes={serverVoicePresence.startTimes}
                  stageTopics={serverVoicePresence.stageTopics}
                    onSelectChannel={handleSelectChannel}
                    onOpenSettings={() => setSettingsOpen(true)}
                    onOpenProfile={app.profile ? () => openProfile(app.profile!) : undefined}
                    onOpenServerSettings={() => setServerSettingsOpen(true)}
                    onOpenServerMenu={app.activeServer ? (x, y) => handleServerContext(app.activeServer!, x, y) : undefined}
                    onChannelContext={handleChannelContext}
                    onCategoryContext={handleCategoryContext}
                    onMoveChannel={(channelId, categoryId, index) => void app.moveChannel(channelId, categoryId, index)}
                    onMoveCategory={(categoryId, index) => void app.moveCategory(categoryId, index)}
                    onCreateChannel={(name, type, categoryId) => app.createChannel({ name, type, categoryId })}
                    onCreateCategory={(name) => app.createCategory(name)}
                    catalystCount={app.activeServer ? app.catalystCounts[app.activeServer.id] ?? 0 : 0}
                    onOpenCatalysts={app.activeServer ? () => setCatalystServerId(app.activeServer!.id) : undefined}
                  />
                </div>
              )}
            </div>
            </div>
            </div>
            {/* w-0 min-w-full: these fit the column instead of setting its width.
                A long name and badges made the user panel wider than the rail
                and channel list together, which stretched the whole sidebar
                and left an empty strip beside the list (wider on Windows,
                where text renders wider). */}
            <div className="w-0 min-w-full">
              <CallIndicator />
              <UserPanel onOpenSettings={() => setSettingsOpen(true)} onOpenProfile={app.profile ? () => openProfile(app.profile!) : undefined} onContextMenu={handleUserPanelContext} />
            </div>
          </div>
        </>
      )}

      {app.viewMode === "dm" && dmFriend && (
        <>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <ChatCanvas
            key={app.activeDmThreadId}
            ref={dmChatRef}
            headerLeading={mobileMenuButton}
            channelName={displayName(dmFriend)}
            messages={dmMessages}
            loading={app.dmLoading}
            members={dmMembers}
            currentUserId={app.user?.id}
            isBlockedAuthor={app.isBlockedEitherWay}
            currentUserName={app.profile ? displayName(app.profile) : undefined}
            messageContext="dm"
            reactions={app.messageReactions}
            typingScope={{ kind: "dm", id: app.activeDmThreadId! }}
            readCursorScope={{ kind: "dm", id: app.activeDmThreadId! }}
            composerLockedReason={
              app.officialProfile && dmFriend.id === app.officialProfile.id
                ? "This is a certified Disband broadcast. Replies are closed — watch for new notices here."
                : undefined
            }
            composerNotice={<MessageRequestBar threadId={app.activeDmThreadId!} friend={dmFriend} />}
            headerTrailing={
              !dmCallActive ? (
	                <HeaderToolbar
	                    scopeKind="dm"
	                    favoriteTarget={app.activeDmThreadId ? { kind: "dm", id: app.activeDmThreadId } : null}
	                    serverId={null}
	                    containerId={app.activeDmThreadId}
	                    pinnedOpen={pinnedOpen}
	                    searchOpen={searchOpen}
	                    onOpenSearch={() => setSearchOpen(true)}
	                    onCloseSearch={closeSearch}
	                    searchQuery={searchQuery}
	                    onSearchQueryChange={setSearchQuery}
	                    onTogglePins={() => {
	                      setPinnedOpen(true);
	                      if (app.activeDmThreadId) void app.loadPinnedMessages("dm", app.activeDmThreadId);
	                    }}
	                    showMembersToggle
	                    membersVisible={showDmProfile}
	                    onToggleMembers={() => setShowDmProfile((v) => !v)}
	                    leading={
	                      <HeaderCallButton
	                        disabled={call.phase !== "idle" || groupCall.phase !== "idle"}
	                        onClick={() => void startVoiceCall(dmFriend)}
	                      />
	                    }
	                  />
              ) : null
            }
            callPanel={renderCallPanel()}
            onSend={app.sendDmMessage}
            onEdit={app.editDmMessage}
            onToggleReaction={(id, emoji) => void app.toggleReaction("dm", id, emoji)}
            onMessageContext={(m, x, y) => handleMessageContext(m, x, y, "dm")}
            onForward={(m) => setForwardMessage(m)}
            onAuthorClick={handleAuthorClick}
            hasMore={app.dmHasMore}
            onLoadMore={app.loadMoreDmMessages}
          />
          </div>
          {searchOpen && (
            <div className="fixed inset-y-0 right-0 z-40 flex min-h-0 w-full max-w-[360px] flex-col overflow-hidden bg-bg-secondary shadow-[var(--elevation-high)] lg:static lg:z-auto lg:w-[360px] lg:max-w-none lg:shrink-0 lg:shadow-none">
              <SearchPanel
                scopeKind="dm"
                serverId={null}
                containerId={app.activeDmThreadId}
                onJump={handleSearchJump}
                onClose={closeSearch}
                query={searchQuery}
                onQueryChange={setSearchQuery}
              />
            </div>
          )}
          {!searchOpen && showDmProfile && (
            <div className="hidden min-h-0 shrink-0 lg:flex">
              <DmProfileRail
                friend={dmFriend}
                onClose={() => setShowDmProfile(false)}
                onVoiceCall={() => void startVoiceCall(dmFriend)}
                onOpenFullProfile={() => openProfile(dmFriend)}
              />
            </div>
          )}
        </>
      )}

      {/* The conversation may be gone (deleted, access revoked, stale link):
          render an honest dead-end instead of a blank pane. */}
      {app.viewMode === "dm" && !dmFriend && (
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 bg-bg-primary px-6 text-center">
          <p className="text-[15px] font-semibold text-text-normal">{t("Conversation unavailable")}</p>
          <p className="max-w-sm text-sm text-text-muted">
            {t("This conversation may have been deleted, or you may no longer have access to it.")}
          </p>
          <button
            type="button"
            onClick={() => app.setViewHome()}
            className="mt-1 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
          >
            {t("Back to friends")}
          </button>
        </div>
      )}

      {app.viewMode === "group" && activeGroup && (
        <>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {groupCall.joined && groupCall.groupId === activeGroup.id ? (
              <GroupCallStage
                groupName={activeGroup.name}
                members={activeGroup.members}
                presence={groupCall.presence}
                ringingIds={groupCall.ringingIds}
                joined={groupCall.joined}
                inCallUserIds={groupCall.inCallUserIds}
                selfId={app.user?.id ?? ""}
                localStream={groupCall.localStream}
                remoteStreams={groupCall.remoteStreams}
                connectedPeerIds={groupCall.connectedPeerIds}
                remoteScreens={groupCall.remoteScreens}
                remoteScreenAudio={groupCall.remoteScreenAudio}
                screenShareEnabled={groupCall.screenShareEnabled}
                onToggleScreenShare={() => void groupCall.toggleScreenShare()}
                localScreen={groupCall.localScreen}
                cameraEnabled={groupCall.cameraEnabled}
                micMuted={app.micMuted}
                deafened={app.deafened}
                connectedAt={groupCall.connectedAt}
                onJoin={() => void groupCall.joinGroupCall(activeGroup.id, activeGroup.name)}
                onLeave={() => void groupCall.endGroupCall()}
                onToggleCamera={() => void groupCall.toggleCamera()}
                onToggleMic={toggleMic}
              />
            ) : (
              <ChatCanvas
                key={app.activeGroupChatId}
                ref={groupChatRef}
                headerLeading={mobileMenuButton}
                channelName={activeGroup.name}
                messages={groupMessages}
                loading={app.groupLoading}
                members={activeGroup.members}
                currentUserId={app.user?.id}
            isBlockedAuthor={app.isBlockedEitherWay}
                currentUserName={app.profile ? displayName(app.profile) : undefined}
                messageContext="group"
                reactions={app.messageReactions}
                typingScope={{ kind: "group", id: app.activeGroupChatId! }}
                readCursorScope={{ kind: "group", id: app.activeGroupChatId! }}
                headerTrailing={
	                  <HeaderToolbar
	                      scopeKind="group"
	                      favoriteTarget={app.activeGroupChatId ? { kind: "group", id: app.activeGroupChatId } : null}
	                      serverId={null}
	                      containerId={app.activeGroupChatId}
	                      pinnedOpen={pinnedOpen}
	                      searchOpen={searchOpen}
	                      onOpenSearch={() => setSearchOpen(true)}
	                      onCloseSearch={closeSearch}
	                      searchQuery={searchQuery}
	                      onSearchQueryChange={setSearchQuery}
	                      onTogglePins={() => {
	                        setPinnedOpen(true);
	                        if (app.activeGroupChatId) void app.loadPinnedMessages("group", app.activeGroupChatId);
	                      }}
	                      showMembersToggle
                          membersVisible={membersVisible}
                          onToggleMembers={() => persistMembersVisible(!membersVisible)}
	                      leading={
	                        <>
	                          <HeaderCallButton
	                            disabled={call.phase !== "idle" || groupCall.phase !== "idle"}
	                            onClick={startGroupVoiceCall}
	                          />
	                          <button
	                            type="button"
	                            onClick={() => {
	                              setInviteGroupId(activeGroup.id);
	                              setInviteGroupOpen(true);
	                            }}
	                            title={t("Add friends to group")}
	                            aria-label={t("Add friends to group")}
	                            className="flex h-6 w-6 shrink-0 items-center justify-center text-interactive-normal transition-colors hover:text-interactive-active"
	                          >
	                            <IconUserPlus size={22} />
	                          </button>
	                        </>
	                      }
	                    />
                }
                onSend={app.sendGroupMessage}
                onEdit={app.editGroupMessage}
                onToggleReaction={(id, emoji) => void app.toggleReaction("group", id, emoji)}
                onMessageContext={(m, x, y) => handleMessageContext(m, x, y, "group")}
                onForward={(m) => setForwardMessage(m)}
                onAuthorClick={handleAuthorClick}
                hasMore={app.groupHasMore}
                onLoadMore={app.loadMoreGroupMessages}
              />
            )}
          </div>
          {searchOpen ? (
            <div className="fixed inset-y-0 right-0 z-40 flex min-h-0 w-full max-w-[360px] flex-col overflow-hidden bg-bg-secondary shadow-[var(--elevation-high)] lg:static lg:z-auto lg:w-[360px] lg:max-w-none lg:shrink-0 lg:shadow-none">
              <SearchPanel
                scopeKind="group"
                serverId={null}
                containerId={app.activeGroupChatId}
                onJump={handleSearchJump}
                onClose={closeSearch}
                query={searchQuery}
                onQueryChange={setSearchQuery}
              />
            </div>
          ) : (membersVisible ? (
            <div className="hidden min-h-0 w-60 shrink-0 flex-col bg-bg-secondary lg:flex">
              <GroupMemberList
                members={activeGroup.members}
                ownerId={activeGroup.owner_id}
                inCallUserIds={groupCall.inCallUserIds}
                currentUserId={app.user?.id}
                onMemberClick={(p) => openProfile(p)}
                onMemberContext={handleGroupMemberContext}
                onInvite={() => {
                  setInviteGroupId(activeGroup.id);
                  setInviteGroupOpen(true);
                }}
              />
            </div>
          ) : null)}
        </>
      )}

      {app.viewMode === "group" && !activeGroup && (
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 bg-bg-primary px-6 text-center">
          <p className="text-[15px] font-semibold text-text-normal">{t("Conversation unavailable")}</p>
          <p className="max-w-sm text-sm text-text-muted">
            {t("This group may have been deleted, or you may no longer be a member.")}
          </p>
          <button
            type="button"
            onClick={() => app.setViewHome()}
            className="mt-1 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
          >
            {t("Back to friends")}
          </button>
        </div>
      )}

      {app.viewMode === "notes" && (
        <ChatCanvas
          key="notes"
          ref={notesChatRef}
          headerLeading={mobileMenuButton}
          channelName="Notes"
          channelIcon={<IconNotes size={22} className="text-text-muted" />}
          introText="Your private Notes — only you can see this"
          placeholder={t("Write a note, or drop in an image, video or file…")}
          messages={noteMessages}
          members={notesMembers}
          currentUserId={app.user?.id}
            isBlockedAuthor={app.isBlockedEitherWay}
          messageContext="notes"
          headerTrailing={
            pinnedNoteIds.size > 0 ? (
              <span className="flex items-center gap-1 rounded-full bg-bg-accent px-2 py-0.5 text-[11px] font-medium text-text-muted">
                <IconPin size={12} />
                {pinnedNoteIds.size} pinned
              </span>
            ) : null
          }
          onSend={app.sendNote}
          onEdit={app.editNote}
          onMessageContext={handleNoteContext}
          onAuthorClick={handleAuthorClick}
          hasMore={app.notesHasMore}
          onLoadMore={app.loadMoreNotes}
        />
      )}

      {app.viewMode === "home" && homePage === "aero" && (
        <AeroPage
          onCheckout={(request) => {
            setCheckoutStart(request);
            setSubscriptionOpen(true);
          }}
        />
      )}
      {app.viewMode === "home" && homePage !== "aero" && (
        <>
          <FriendsPanel onOpenProfile={openProfile} onFriendContext={handleFriendContext} />
          <ActiveNowPanel />
        </>
      )}

      {app.viewMode === "discover" && <DiscoverPanel tab={discoverTab} onTabChange={setDiscoverTab} query={discoverQuery} onQueryChange={setDiscoverQuery} />}

      {catalystPage && (
        <CatalystModal
          server={app.servers.find((s) => s.id === catalystServerId) ?? null}
          open
          onClose={() => setCatalystServerId(null)}
        />
      )}
      {!catalystPage && app.viewMode === "space" && activeChannel && isVoice && activeChannel.is_stage && (
        <StagePanel channel={activeChannel} />
      )}

      {!catalystPage && app.viewMode === "space" && activeChannel && isVoice && !activeChannel.is_stage && (
        <VoicePanel
          channelId={activeChannel.id}
          channelName={activeChannel.name}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}

      {!catalystPage && app.viewMode === "space" && activeChannel && activeChannel.type === "forum" && (
        <ForumView
          key={activeChannel.id}
          forum={activeChannel}
          canManage={canManageChannels}
          headerLeading={mobileMenuButton}
          headerTrailing={
            <HeaderToolbar
              scopeKind="server"
              serverId={activeChannel.server_id}
              containerId={null}
              searchOpen={searchOpen}
              onOpenSearch={() => setSearchOpen(true)}
              onCloseSearch={closeSearch}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              showMembersToggle
              membersVisible={membersVisible}
              onToggleMembers={() => persistMembersVisible(!membersVisible)}
              favoriteTarget={{ kind: "channel", id: activeChannel.id }}
            />
          }
        />
      )}

      {!catalystPage && app.viewMode === "space" && activeChannel && !isVoice && activeChannel.type !== "forum" && (
        <ChatCanvas
          key={app.activeChannelId}
          ref={channelChatRef}
          headerLeading={
            activeParentForum ? (
              <>
                {mobileMenuButton}
                <button
                  type="button"
                  onClick={() => app.selectChannel(activeParentForum.id)}
                  aria-label={t("Back to #{name}", { name: activeParentForum.name })}
                  title={t("Back to #{name}", { name: activeParentForum.name })}
                  className="-ml-1 flex h-8 shrink-0 items-center gap-1 rounded-lg pl-1 pr-2 text-[14px] font-semibold text-interactive-normal transition-colors hover:bg-interactive-hover hover:text-interactive-active"
                >
                  <IconChevronLeft size={18} />
                  <span className="hidden max-w-[160px] truncate sm:inline">{activeParentForum.name}</span>
                </button>
              </>
            ) : (
              mobileMenuButton
            )
          }
          channelName={activeChannel.name}
          topic={activeParentForum ? null : activeChannel.topic ?? null}
          introText={
            activeParentForum
              ? t("This is the start of “{title}”, a post in #{forum}.", { title: activeChannel.name, forum: activeParentForum.name })
              : undefined
          }
          headerExtra={
            activeParentForum && (activeChannel.post_tags?.length ?? 0) > 0 ? (
              <span className="hidden shrink-0 items-center gap-1 md:flex">
                {activeChannel.post_tags!.map((tag) => (
                  <span key={tag} className="rounded-full border border-border-subtle bg-bg-tertiary px-2 py-px text-[11px] font-semibold text-text-muted">
                    {tag}
                  </span>
                ))}
              </span>
            ) : undefined
          }
          // Announcement channels (read-only + managers only) carry the
          // megaphone so the header matches the rail; forum posts carry the
          // forum glyph.
          channelIcon={
            activeParentForum
              ? <IconForum size={18} />
              : activeChannel.read_only ? <IconMegaphone size={18} className="text-brand" /> : undefined
          }
          composerLockedReason={
            myTimeoutLabel
              ? `You are timed out in this space for ${myTimeoutLabel}.`
              : activeChannel.read_only && !canManageChannels
                ? "This is an announcement channel. Only people who can manage channels may post here."
                : !canManageChannels && activeChannelEffect && !activeChannelEffect.can_post
                  ? "You don't have permission to post in this channel."
                  : null
          }
          messages={channelMessages}
          loading={app.messagesLoading}
          members={channelMembers}
          roles={app.serverRoles}
          customEmoji={app.customEmojiMap}
          channels={app.channels}
          onChannelClick={(id) => void app.selectChannel(id)}
          currentUserId={app.user?.id}
            isBlockedAuthor={app.isBlockedEitherWay}
          currentUserName={app.profile ? displayName(app.profile) : undefined}
          messageContext="channel"
          reactions={app.messageReactions}
          reactionsEnabled={canManageChannels ? true : (activeChannelEffect?.can_react ?? true)}
          typingScope={{ kind: "channel", id: activeChannel.id, serverId: activeChannel.server_id }}
          readCursorScope={{ kind: "channel", id: activeChannel.id }}
          getAuthorColor={getAuthorColor}
          getAuthorIconRole={app.viewMode === "space" ? getAuthorIconRole : undefined}
          onSend={app.sendChannelMessage}
          onEdit={app.editChannelMessage}
          onToggleReaction={(id, emoji) => void app.toggleReaction("channel", id, emoji)}
          onMessageContext={(m, x, y) => handleMessageContext(m, x, y, "channel")}
          onForward={(m) => setForwardMessage(m)}
          onAuthorClick={handleAuthorClick}
          onAuthorContextMenu={handleAuthorContext}
          headerTrailing={
            <HeaderToolbar
              scopeKind="server"
              serverId={activeChannel.server_id}
              containerId={null}
              pinnedOpen={pinnedOpen}
              searchOpen={searchOpen}
              onOpenSearch={() => setSearchOpen(true)}
              onCloseSearch={closeSearch}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              onTogglePins={() => {
                setPinnedOpen(true);
                if (app.activeChannelId) void app.loadPinnedMessages("channel", app.activeChannelId);
              }}
              showMembersToggle
              membersVisible={membersVisible}
              onToggleMembers={() => persistMembersVisible(!membersVisible)}
              favoriteTarget={{ kind: "channel", id: activeChannel.id }}
            />
          }
          composerNotice={
            activeChannel.slow_mode_seconds && activeChannel.slow_mode_seconds > 0 ? (
              <SlowModeNotice
                seconds={activeChannel.slow_mode_seconds}
                exempt={canManageChannels || app.hasServerPermission("manage_messages")}
                lastOwnMessageAt={lastOwnChannelMessageAt}
              />
            ) : undefined
          }
          hasMore={app.channelHasMore}
          onLoadMore={app.loadMoreChannelMessages}
        />
      )}

      {app.viewMode === "space" && !activeChannel && (
        <div className="flex min-w-0 flex-1 items-center justify-center bg-bg-primary px-6 text-center">
          <p className="text-[15px] text-text-muted">
            {app.channels.length ? t("Pick a channel to start talking.") : t("This space has no channels yet.")}
          </p>
        </div>
      )}

      {app.viewMode === "space" && searchOpen && (
        <div className="fixed inset-y-0 right-0 z-40 flex min-h-0 w-full max-w-[360px] flex-col overflow-hidden bg-bg-secondary shadow-[var(--elevation-high)] lg:static lg:z-auto lg:w-[360px] lg:max-w-none lg:shrink-0 lg:shadow-none">
          <SearchPanel
            scopeKind="server"
            serverId={app.activeServerId}
            containerId={null}
            onJump={handleSearchJump}
            onClose={closeSearch}
            query={searchQuery}
            onQueryChange={setSearchQuery}
          />
        </div>
      )}

      {app.viewMode === "space" && !isMobile && !searchOpen && membersVisible && (
        <MemberList
          serverId={app.activeServerId}
          channelId={app.activeChannelId}
          members={app.members}
          roles={app.serverRoles}
          ownerId={app.activeServer?.owner_id ?? null}
          loading={app.membersLoading}
          hasMore={app.membersHasMore}
          onLoadMore={() => void app.loadMoreMembers()}
          onMemberClick={(m) => openProfile(m.profile)}
          onMemberContext={handleMemberContext}
        />
      )}

      <UserProfilePopout
        profile={profileTarget && !profileFull ? profileTarget : null}
        anchor={profileAnchor}
        onClose={() => setProfileTarget(null)}
        onOpenFullProfile={() => setProfileFull(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onBlock={
          profileTarget && !app.isBlocked(profileTarget.id)
            ? () => {
                void confirmDialog({
                  title: t("Block {name}", { name: displayName(profileTarget) }),
                  body: t("They won't be able to message you."),
                  confirmLabel: t("Block"),
                  action: async () => {
                    const err = await app.blockUser(profileTarget.id);
                    if (err) void alertDialog(err);
                  },
                });
              }
            : undefined
        }
        onUnblock={
          profileTarget && app.isBlocked(profileTarget.id)
            ? () => {
                void app.unblockUser(profileTarget.id);
                setProfileTarget(null);
              }
            : undefined
        }
        onReport={
          profileTarget && profileTarget.id !== app.user?.id
            ? () => setReportTarget({ kind: "profile", profile: profileTarget })
            : undefined
        }
        isSelf={profileTarget?.id === app.user?.id}
        plan={profileTarget?.id === app.user?.id ? subPlan : undefined}
        isServerMember={!!profileServerMember}
        rolesPending={app.viewMode === "space" && !profileServerMember && profileMemberPending}
        memberJoinedAt={profileServerMember?.joined_at ?? null}
        serverName={app.activeServer?.name ?? null}
        serverIcon={app.activeServer?.icon_url ?? null}
        serverRoles={app.serverRoles}
        assignableRoles={assignableServerRoles}
        canManageRoles={profileCanManageRoles}
        memberRoleIds={
          profileServerMember?.role_ids && profileServerMember.role_ids.length > 0
            ? profileServerMember.role_ids
            : profileServerMember?.role_id
              ? [profileServerMember.role_id]
              : []
        }
        onSetRoles={
          profileTarget && profileCanManageRoles
            ? (roleIds) => {
                void app.setMemberRoles(profileTarget.id, roleIds).then((err) => {
                  if (err) void alertDialog(err);
                  else setProfileMemberRefresh((n) => n + 1);
                });
              }
            : undefined
        }
        selfAssignableRoles={app.serverRoles.filter((role) => !role.is_default && role.self_assignable)}
        onSetSelfRoles={
          profileTarget?.id === app.user?.id
            ? (roleIds) => {
                void app.setSelfRoles(roleIds).then((err) => {
                  if (err) void alertDialog(err);
                  else setProfileMemberRefresh((n) => n + 1);
                });
              }
            : undefined
        }
      />
      <UserProfileModal
        profile={profileTarget}
        open={!!profileTarget && profileFull}
        onClose={() => setProfileTarget(null)}
        isSelf={profileTarget?.id === app.user?.id}
        plan={profileTarget?.id === app.user?.id ? subPlan : undefined}
        isFriend={profileFriend}
        isBlocked={profileTarget ? app.isBlocked(profileTarget.id) : false}
        pendingIncoming={profilePendingIncoming}
        pendingOutgoing={profilePendingOutgoing}
        onMessage={
          profileTarget
            ? () => {
                void app.openDmWithFriend(profileTarget.id).then((err) => {
                  if (err) void alertDialog(err);
                  else setProfileTarget(null);
                });
              }
            : undefined
        }
        onVoiceCall={
          profileTarget && profileFriend
            ? () => {
                void startVoiceCall(profileTarget);
                setProfileTarget(null);
              }
            : undefined
        }
        onAddFriend={
          profileTarget?.username
            ? () => {
                void app.sendFriendRequest(profileTarget.username!).then((err) => {
                  if (err) void alertDialog(err);
                  else setProfileTarget(null);
                });
              }
            : undefined
        }
        onAcceptFriend={
          profileIncomingRequestId
            ? () => {
                void app.respondFriendRequest(profileIncomingRequestId, true).then(() => setProfileTarget(null));
              }
            : undefined
        }
        onDeclineFriend={
          profileIncomingRequestId
            ? () => {
                void app.respondFriendRequest(profileIncomingRequestId, false).then(() => setProfileTarget(null));
              }
            : undefined
        }
        onRemoveFriend={
          profileTarget && profileFriend
            ? () => {
                void confirmDialog({
                  title: t("Remove {name}", { name: displayName(profileTarget) }),
                  body: t("They'll be removed from your friends."),
                  confirmLabel: t("Remove Friend"),
                  action: async () => {
                    await app.removeFriend(profileTarget.id);
                    setProfileTarget(null);
                  },
                });
              }
            : undefined
        }
        onBlock={
          profileTarget && !app.isBlocked(profileTarget.id)
            ? () => {
                void confirmDialog({
                  title: t("Block {name}", { name: displayName(profileTarget) }),
                  body: t("They won't be able to message you."),
                  confirmLabel: t("Block"),
                  action: async () => {
                    const err = await app.blockUser(profileTarget.id);
                    if (err) void alertDialog(err);
                    else setProfileTarget(null);
                  },
                });
              }
            : undefined
        }
        onUnblock={
          profileTarget && app.isBlocked(profileTarget.id)
            ? () => {
                void app.unblockUser(profileTarget.id);
                setProfileTarget(null);
              }
            : undefined
        }
        onOpenSettings={() => setSettingsOpen(true)}
        onReport={
          profileTarget && profileTarget.id !== app.user?.id
            ? () => setReportTarget({ kind: "profile", profile: profileTarget })
            : undefined
        }
        isServerMember={!!profileServerMember}
        rolesPending={app.viewMode === "space" && !profileServerMember && profileMemberPending}
        serverRoles={app.serverRoles}
        assignableRoles={assignableServerRoles}
        canManageRoles={profileCanManageRoles}
        memberRoleIds={
          profileServerMember?.role_ids && profileServerMember.role_ids.length > 0
            ? profileServerMember.role_ids
            : profileServerMember?.role_id
              ? [profileServerMember.role_id]
              : []
        }
        memberIsOwner={profileServerMember?.role === "owner"}
        onSetRoles={
          profileTarget && profileCanManageRoles
            ? (roleIds) => {
                void app.setMemberRoles(profileTarget.id, roleIds).then((err) => {
                  if (err) void alertDialog(err);
                  else setProfileMemberRefresh((n) => n + 1);
                });
              }
            : undefined
        }
        selfAssignableRoles={app.serverRoles.filter((role) => !role.is_default && role.self_assignable)}
        onSetSelfRoles={
          profileTarget?.id === app.user?.id
            ? (roleIds) => {
                void app.setSelfRoles(roleIds).then((err) => {
                  if (err) void alertDialog(err);
                  else setProfileMemberRefresh((n) => n + 1);
                });
              }
            : undefined
        }
      />

      <GuildTagSpaceModal />

      <SettingsModal
        open={settingsOpen}
        onClose={() => { setSettingsOpen(false); setSettingsInitialTab(null); }}
        initialTab={settingsInitialTab ?? undefined}
      />
      <ReminderDialog target={reminderTarget} onClose={() => setReminderTarget(null)} />
      <SubscriptionModal
        open={subscriptionOpen}
        onClose={() => {
          setSubscriptionOpen(false);
          setCheckoutStart(null);
        }}
        userId={app.user?.id}
        startWith={checkoutStart}
      />
      <ShopModal
        open={shopOpen}
        onClose={() => setShopOpen(false)}
        initialCategory={shopCategory}
        // Equipping writes profiles.equipped_* server-side: reload the own
        // profile so the bottom-left panel, profile popout, and every other
        // context-profile avatar pick the new effect up immediately (chat
        // already shows it — message authors are fetched fresh per row).
        onChanged={() => void app.refreshProfile()}
        self={{
          name: app.profile ? displayName(app.profile) : "You",
          avatarUrl: app.profile?.avatar_url,
        }}
        // Equipping is a profile UPDATE, and the profiles realtime
        // subscription already reloads on that — every avatar and name on
        // screen picks the new effect up without anything further here.
      />
      <TimeoutModal
        open={!!timeoutTarget}
        profile={timeoutTarget?.profile ?? null}
        onClose={() => setTimeoutTarget(null)}
        onSubmit={async (seconds, reason) =>
          timeoutTarget ? app.timeoutMember(timeoutTarget.userId, seconds, reason || undefined) : null
        }
      />
      <ReportModal target={reportTarget} onClose={() => setReportTarget(null)} />

      <CreateServerModal open={createServerOpen} onClose={() => setCreateServerOpen(false)} />
      <DonationAppealModal />
      <QuickSwitcher open={quickSwitcherOpen} onClose={() => setQuickSwitcherOpen(false)} />
      {folderDialogMounted && shownFolderDialog && (
        <ServerFolderDialog
          exiting={folderDialogExiting}
          title={shownFolderDialog.mode === "create" ? t("Create Folder") : t("Edit Folder")}
          initialName={
            shownFolderDialog.mode === "edit"
              ? (app.serverFolders.find((f) => f.id === shownFolderDialog.folderId)?.name ?? "")
              : pendingFolderServer
                ? `${pendingFolderServer.name}`
                : ""
          }
          initialColor={
            shownFolderDialog.mode === "edit"
              ? (app.serverFolders.find((f) => f.id === shownFolderDialog.folderId)?.color ?? "#5865f2")
              : "#5865f2"
          }
          onClose={() => {
            setFolderDialog(null);
            setPendingFolderServer(null);
          }}
          onSave={async (name, color) => {
            if (shownFolderDialog.mode === "create") {
              const id = await app.createFolder(name, color);
              if (typeof id === "string" && pendingFolderServer) {
                const members = app.serverListState.filter((s) => s.folder_id === id);
                await app.setServerSlot(pendingFolderServer.id, members.length, id);
              }
            } else if (shownFolderDialog.folderId) {
              const err = await app.renameFolder(shownFolderDialog.folderId, name);
              if (!err) await app.setFolderColor(shownFolderDialog.folderId, color);
              if (err) throw new Error(err);
            }
          }}
        />
      )}
      <ServerSettingsModal
        open={serverSettingsOpen}
        onClose={() => setServerSettingsOpen(false)}
        onOpenCatalysts={app.activeServer ? () => setCatalystServerId(app.activeServer!.id) : undefined}
        onEditChannel={(ch) => {
          setServerSettingsOpen(false);
          setChannelSettingsChannel(app.channels.find((c) => c.id === ch.id) ?? null);
        }}
      />
      <ChannelSettingsModal
        channel={channelSettingsChannel}
        onClose={() => setChannelSettingsChannel(null)}
      />
      <InviteSpaceModal server={inviteSpace} onClose={() => setInviteSpace(null)} />
      <SpaceNotificationsModal server={notifySpace} onClose={() => setNotifySpace(null)} />
      <CreateChannelModal
        target={createChannelTarget}
        categories={app.categories}
        onClose={() => setCreateChannelTarget(null)}
        onCreate={(name, kind, categoryId) => app.createChannel({ name, type: kind, categoryId })}
      />
      <InviteGroupModal
        open={inviteGroupOpen && !!inviteGroupId}
        groupId={inviteGroupId}
        members={app.groupChats.find((g) => g.id === inviteGroupId)?.members ?? []}
        onClose={() => {
          setInviteGroupOpen(false);
          setInviteGroupId(null);
        }}
      />

      <ForwardModal
        open={!!forwardMessage}
        onClose={() => setForwardMessage(null)}
        onForward={handleForward}
      />
      <PinnedMessagesPanel
        open={pinnedOpen}
        threadName={
          app.viewMode === "group" && app.activeGroupChatId
            ? (app.groupChats.find((g) => g.id === app.activeGroupChatId)?.name ?? "Group")
            : app.viewMode === "space" && app.activeChannelId
              ? (app.channels.find((c) => c.id === app.activeChannelId)?.name ?? "Channel")
              : dmFriend
                ? displayName(dmFriend)
                : ""
        }
        pins={
          app.viewMode === "group" && app.activeGroupChatId
            ? app.pinnedBySource[`group:${app.activeGroupChatId}`] ?? []
            : app.viewMode === "space" && app.activeChannelId
              ? app.pinnedBySource[`channel:${app.activeChannelId}`] ?? []
              : app.activeDmThreadId
                ? app.pinnedBySource[`dm:${app.activeDmThreadId}`] ?? []
                : []
        }
        onClose={() => setPinnedOpen(false)}
        onUnpin={(messageId) => {
          if (app.viewMode === "group" && app.activeGroupChatId) void app.unpinMessage("group", app.activeGroupChatId, messageId);
          else if (app.viewMode === "space" && app.activeChannelId) void app.unpinMessage("channel", app.activeChannelId, messageId);
          else if (app.activeDmThreadId) void app.unpinMessage("dm", app.activeDmThreadId, messageId);
        }}
      />
        </div>
      </div>
    </div>
  );
}

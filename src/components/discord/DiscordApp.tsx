"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyAudioOutputToElement, getPreferredAudioOutputId } from "@/lib/audio-settings";
import { useApp } from "@/contexts/AppContext";
import { useIsMobile } from "@/hooks/useIsMobile";
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
import { ChannelList } from "./ChannelList";
import { HomePanel } from "./HomePanel";
import { DiscoverPanel, DiscoverSidebar, type DiscoverTab } from "./DiscoverPanel";
import { UserPanel } from "./UserPanel";
import dynamic from "next/dynamic";
import { ActiveNowPanel, FriendsPanel } from "./FriendsPanel";
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
import { GroupMemberList } from "./GroupMemberList";
import { InviteGroupModal } from "./InviteGroupModal";
const SettingsModal = dynamic(() => import("./SettingsModal").then(m => m.SettingsModal));
import { CreateServerModal } from "@/components/modals/CreateServerModal";
const ServerSettingsModal = dynamic(() => import("@/components/modals/ServerSettingsModal").then(m => m.ServerSettingsModal));
const ChannelSettingsModal = dynamic(() => import("@/components/modals/ChannelSettingsModal").then(m => m.ChannelSettingsModal));
import { UserProfileModal } from "@/components/modals/UserProfileModal";
import {
  IconCopy,
  IconClose,
  IconLeave,
  IconSettings,
  IconTrash,
  IconFriends,
  IconGroup,
  IconPhone,
  IconStar,
  IconNotes,
  IconPin,
  IconPinOff,
  IconMenu,
  IconPlus,
  IconEdit,
  IconFolder,
  IconFolderPlus,
  IconFolderMinus,
  IconTimer,
} from "@/components/icons";
const SubscriptionModal = dynamic(() => import("@/components/subscription/SubscriptionModal").then(m => m.SubscriptionModal));
const ShopModal = dynamic(() => import("@/components/shop/ShopModal").then(m => m.ShopModal));
import { displayName, getInviteUrl, normalizeMessageContent } from "@/lib/utils";
import type { Channel, ChannelCategory, Profile, Server, ServerFolder } from "@/lib/supabase/types";
import { ServerFolderDialog } from "@/components/discord/ServerFolderDialog";
import type { MessageContext } from "@/lib/messages";
import type { ChatMessageData } from "./ChatMessage";
import { ForwardModal, type ForwardDestination } from "./ForwardModal";
import { PinnedMessagesPanel } from "./PinnedMessagesPanel";
import { DmProfileRail } from "./DmProfileRail";
import { CatalystModal } from "./CatalystModal";

export function DiscordApp() {
  const app = useApp();
  const { openMenu } = useContextMenu();
  const [timeoutTarget, setTimeoutTarget] = useState<{ userId: string; profile: Profile } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [discoverTab, setDiscoverTab] = useState<DiscoverTab>("popular");
  const [discoverQuery, setDiscoverQuery] = useState("");
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [createServerOpen, setCreateServerOpen] = useState(false);
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false);
  const [folderDialog, setFolderDialog] = useState<{ mode: "create" | "edit"; folderId: string | null } | null>(null);
  const [pendingFolderServer, setPendingFolderServer] = useState<Server | null>(null);
  const [channelSettingsChannel, setChannelSettingsChannel] = useState<Channel | null>(null);
  const [profileTarget, setProfileTarget] = useState<Profile | null>(null);
  const [inviteGroupOpen, setInviteGroupOpen] = useState(false);
  const [inviteGroupId, setInviteGroupId] = useState<string | null>(null);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);
  const [forwardMessage, setForwardMessage] = useState<ChatMessageData | null>(null);

  const [showDmProfile, setShowDmProfile] = useState(true);

  const [catalystServerId, setCatalystServerId] = useState<string | null>(null);
  const { plan: subPlan, entitlements } = useSubscription(app.user?.id);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("redirect_status") === "succeeded") {
      setCheckoutSuccess(true);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

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
  const [online, setOnline] = useState(true);
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

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

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

    const savedId = getLastChannelId(serverId);
    const target =
      (savedId ? app.channels.find((c) => c.id === savedId) : undefined)
      ?? app.channels.find((c) => c.type === "text")
      ?? app.channels[0];
    if (target) app.selectChannel(target.id);
  }, [app.viewMode, app.activeServerId, app.activeChannelId, app.channels, app.selectChannel]);
  const isVoice = activeChannel?.type === "voice";
  const dmFriend =
    app.dmThreads.find((t) => t.id === app.activeDmThreadId)?.friend ??
    (() => {
      const thread = app.dmThreads.find((t) => t.id === app.activeDmThreadId);
      if (!thread || !app.user?.id) return undefined;
      const peerId = thread.user_a === app.user.id ? thread.user_b : thread.user_a;
      return app.friends.find((f) => f.id === peerId);
    })();
  const activeGroup = app.groupChats.find((g) => g.id === app.activeGroupChatId);

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
  const profileServerMember = profileTarget
    ? app.members.find((m) => m.user_id === profileTarget.id)
    : undefined;
  const profileCanManageRoles =
    app.viewMode === "space" && (isServerOwner || app.serverPermissions.manage_roles);

  const getAuthorColor = useCallback(
    (authorId: string) => {
      const member = app.members.find((m) => m.user_id === authorId);
      if (member) return app.getMemberColor(member) ?? undefined;
      return undefined;
    },
    [app],
  );

  const openProfile = useCallback((profile: Profile) => setProfileTarget(profile), []);

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

  const handleServerContext = useCallback(
    (server: Server, x: number, y: number) => {
      const isOwner = server.owner_id === app.user?.id;
      const canInvite = isOwner || !!app.serverPermissions.create_invites;
      const inFolder = app.serverFolders.find((f) =>
        app.serverListState.some((s) => s.server_id === server.id && s.folder_id === f.id),
      );
      const items: ContextMenuItem[] = [
        {
          id: "settings",
          label: "Space Settings",
          icon: <IconSettings size={16} />,
          onClick: () => setServerSettingsOpen(true),
        },
        {
          id: "copy-id",
          label: "Copy Space ID",
          icon: <IconCopy size={16} />,
          onClick: () => void navigator.clipboard.writeText(server.id),
        },
          ...(server.invite_code || server.vanity_code
            ? canInvite
              ? [
                  {
                    id: "invite",
                    label: "Copy Invite Link",
                    icon: <IconCopy size={16} />,
                    onClick: () => void navigator.clipboard.writeText(getInviteUrl(server.vanity_code || server.invite_code!)),
                  },
                ]
              : []
            : []),
          ...[
            {
              id: "boost",
              label: "Boost Space",
              icon: <IconStar size={16} />,
              onClick: () => void boostServer(server.id),
            } as ContextMenuItem,
          ],
        {
          id: "leave",
          label: "Leave Space",
          icon: <IconLeave size={16} />,
          onClick: () => void app.leaveServer(server.id),
        },
        ...(inFolder
          ? [
              {
                id: "unfolder",
                label: `Remove from ${inFolder.name}`,
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
            label: `Move to ${f.name}`,
            icon: <IconFolder size={16} />,
            onClick: () => {
              const members = app.serverListState.filter((s) => s.folder_id === f.id);
              void app.setServerSlot(server.id, members.length, f.id);
            },
          }) as ContextMenuItem),
        {
          id: "new-folder",
          label: "Create Folder with Space",
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
                label: "Delete Space",
                icon: <IconTrash size={16} />,
                danger: true,
                onClick: () => {
                  if (confirm(`Delete "${server.name}"?`)) void app.deleteServer(server.id);
                },
              },
            ]
          : []),
      ];
      openMenu(x, y, items);
    },
    [app, openMenu, subPlan],
  );

  const handleFolderContext = useCallback(
    (folder: ServerFolder, x: number, y: number) => {
      openMenu(x, y, [
        {
          id: "rename",
          label: "Rename Folder",
          icon: <IconEdit size={16} />,
          onClick: () => {
            setPendingFolderServer(null);
            setFolderDialog({ mode: "edit", folderId: folder.id });
          },
        },
        {
          id: "delete",
          label: "Delete Folder",
          icon: <IconTrash size={16} />,
          danger: true,
          onClick: () => {
            if (confirm(`Delete folder "${folder.name}"? Spaces stay where they are.`)) {
              void app.deleteFolder(folder.id);
            }
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

      setCatalystServerId(serverId);
    },
    [],
  );

  const handleChannelContext = useCallback(
    (channel: Channel, x: number, y: number) => {
      const items: ContextMenuItem[] = [
        {
          id: "copy",
          label: "Copy Channel ID",
          icon: <IconCopy size={16} />,
          onClick: () => void navigator.clipboard.writeText(channel.id),
        },
      ];
      if (canManageChannels) {
        items.push(
          {
            id: "settings",
            label: "Edit Channel",
            icon: <IconEdit size={16} />,
            onClick: () => setChannelSettingsChannel(channel),
          },
          {
            id: "delete",
            label: "Delete Channel",
            icon: <IconTrash size={16} />,
            danger: true,
            onClick: () => {
              if (confirm(`Delete #${channel.name}? This cannot be undone.`)) {
                void app.deleteChannel(channel.id);
              }
            },
          },
        );
      }
      openMenu(x, y, items);
    },
    [openMenu, canManageChannels, app],
  );

  const handleCategoryContext = useCallback(
    (category: ChannelCategory, x: number, y: number) => {
      const items: ContextMenuItem[] = [
        {
          id: "copy-id",
          label: "Copy Category ID",
          icon: <IconCopy size={16} />,
          onClick: () => void navigator.clipboard.writeText(category.id),
        },
        {
          id: "copy-server-id",
          label: "Copy Space ID",
          icon: <IconCopy size={16} />,
          onClick: () => void navigator.clipboard.writeText(category.server_id),
        },
      ];
      if (canManageChannels) {
        items.push(
          {
            id: "add-channel",
            label: "Create Channel",
            icon: <IconPlus size={16} />,
            onClick: () => {
              const name = prompt(`Channel name in ${category.name}`, "");
              if (name && name.trim()) void app.createChannel({ name: name.trim(), type: "text", categoryId: category.id });
            },
          },
          {
            id: "rename",
            label: "Rename Category",
            icon: <IconEdit size={16} />,
            onClick: () => {
              const name = prompt("Rename category", category.name);
              if (name && name.trim()) void app.renameCategory(category.id, name.trim());
            },
          },
          {
            id: "delete",
            label: "Delete Category",
            icon: <IconTrash size={16} />,
            danger: true,
            onClick: () => {
              if (confirm(`Delete category ${category.name}? Channels inside will be moved out.`)) {
                void app.deleteCategory(category.id);
              }
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
          }, 300);
        });
      } else if (dest.kind === "group") {
        void app.selectGroupChat(dest.id).then(() => {
          setTimeout(() => {
            void app.sendGroupMessage(content);
          }, 300);
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
          label: isPinned ? "Unpin note" : "Pin note",
          icon: isPinned ? <IconPinOff size={16} /> : <IconPin size={16} />,
          onClick: () => void app.toggleNotePinned(message.id),
        },
        {
          id: "copy-id",
          label: "Copy Note ID",
          icon: <IconCopy size={16} />,
          onClick: () => void navigator.clipboard.writeText(message.id),
        },
        {
          id: "reply",
          label: "Reply to note",
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
                label: "Edit note",
                icon: <IconSettings size={16} />,
                onClick: () =>
                  notesChatRef.current?.setEditing({ id: message.id, content: message.content }),
              },
              {
                id: "copy",
                label: "Copy text",
                icon: <IconCopy size={16} />,
                onClick: () => void navigator.clipboard.writeText(message.content),
              },
            ]
          : []),
        {
          id: "delete",
          label: "Delete note",
          icon: <IconTrash size={16} />,
          danger: true,
          onClick: () => {
            if (confirm("Delete this note? This cannot be undone.")) void app.deleteNote(message.id);
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
      const canPin = app.activeServer?.owner_id === app.user?.id || !!app.serverPermissions.pin_messages;

      openMenu(x, y, [
        {
          id: "reply",
          label: "Reply",
          icon: <IconFriends size={16} />,
          onClick: () => {
            chatRef.current?.setReplyTo({
              id: message.id,
              author_id: message.author_id,
              content: message.content,
              attachment_type: message.attachment_type,
              author: message.author
                ? { id: message.author.id, username: message.author.username, display_name: message.author.display_name }
                : undefined,
            });
          },
        },
        {
          id: "react",
          label: "Add Reaction",
          icon: <IconCopy size={16} />,
          onClick: () => chatRef.current?.openReactionPicker(message.id, x, y),
        },
        ...(context === "dm" && app.activeDmThreadId
          ? [
              {
                id: "pin",
                label: isPinned ? "Unpin Message" : "Pin Message",
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
                label: isPinned ? "Unpin Message" : "Pin Message",
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
          label: "Copy Text",
          icon: <IconCopy size={16} />,
          disabled: !message.content,
          onClick: () => void navigator.clipboard.writeText(message.content),
        },
        {
          id: "copy-id",
          label: "Copy Message ID",
          icon: <IconCopy size={16} />,
          onClick: () => void navigator.clipboard.writeText(String(message.display_id ?? message.id)),
        },
        ...(isOwn && normalizeMessageContent(message.content)
          ? [
              {
                id: "edit",
                label: "Edit Message",
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
                label: "Delete Message",
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
          label: "View Profile",
          icon: <IconFriends size={16} />,
          onClick: () => openProfile(member),
        },
        {
          id: "dm",
          label: "Message",
          icon: <IconFriends size={16} />,
          onClick: () => void app.openDmWithFriend(member.id),
        },
        {
          id: "copy",
          label: "Copy User ID",
          icon: <IconCopy size={16} />,
          onClick: () => void navigator.clipboard.writeText(member.id),
        },
      ];
      if (isOwner && member.id !== app.user?.id && member.id !== activeGroup.owner_id) {
        items.push({
          id: "remove",
          label: `Remove ${displayName(member)}`,
          icon: <IconLeave size={16} />,
          danger: true,
          onClick: () => {
            if (confirm(`Remove ${displayName(member)} from "${activeGroup.name}"?`)) {
              void app.removeGroupMember(activeGroup.id, member.id).then((err) => {
                if (err) alert(err);
                else void app.refreshGroupChats();
              });
            }
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
      openMenu(x, y, [
        {
          id: "call",
          label: groupCall.joined ? "In voice" : "Start voice call",
          icon: <IconPhone size={16} />,
          disabled: groupCall.joined || call.phase !== "idle",
          onClick: startGroupVoiceCall,
        },
        {
          id: "invite",
          label: "Invite friends",
          icon: <IconFriends size={16} />,
          onClick: () => {
            setInviteGroupId(group.id);
            setInviteGroupOpen(true);
          },
        },
        {
          id: "copy-id",
          label: "Copy Group ID",
          icon: <IconCopy size={16} />,
          onClick: () => void navigator.clipboard.writeText(group.id),
        },
        ...(isOwner
          ? [
              {
                id: "rename",
                label: "Rename group",
                icon: <IconSettings size={16} />,
                onClick: () => {
                  const next = prompt("New group name", group.name);
                  if (next?.trim()) void app.renameGroupChat(group.id, next.trim());
                },
              },
            ]
          : []),
        {
          id: "leave",
          label: "Leave group",
          icon: <IconLeave size={16} />,
          danger: true,
          onClick: () => {
            if (confirm(`Leave "${group.name}"?`)) {
              if (groupCall.groupId === group.id && groupCall.joined) void groupCall.endGroupCall();
              void app.leaveGroupChat(group.id);
            }
          },
        },
      ]);
    },
    [app, openMenu, groupCall.joined, call.phase, startGroupVoiceCall],
  );

  const handleUserPanelContext = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (!app.profile) return;
      openMenu(e.clientX, e.clientY, [
        {
          id: "settings",
          label: "User Settings",
          icon: <IconSettings size={16} />,
          onClick: () => setSettingsOpen(true),
        },
        {
          id: "copy-id",
          label: "Copy User ID",
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
      const items: ContextMenuItem[] = [
        {
          id: "profile",
          label: "View Profile",
          icon: <IconFriends size={16} />,
          onClick: () => openProfile(member.profile),
        },
        {
          id: "dm",
          label: "Message",
          icon: <IconFriends size={16} />,
          onClick: () => void app.openDmWithFriend(member.user_id),
        },
        {
          id: "copy",
          label: "Copy User ID",
          icon: <IconCopy size={16} />,
          onClick: () => void navigator.clipboard.writeText(member.user_id),
        },
      ];

      if (!isOwnerMember && member.user_id !== app.user?.id) {
        if (canKick) {
          items.push({
            id: "kick",
            label: "Kick",
            icon: <IconLeave size={16} />,
            onClick: () => {
              if (confirm(`Kick ${displayName(member.profile)}?`)) {
                void app.kickMember(member.user_id).then((err) => { if (err) alert(err); });
              }
            },
          });
        }
        if (canBan) {
          items.push({
            id: "ban",
            label: "Ban",
            icon: <IconTrash size={16} />,
            danger: true,
            onClick: () => {
              if (confirm(`Ban ${displayName(member.profile)}? This deletes all their messages and prevents them from rejoining.`)) {
                void app.banMember(member.user_id).then((err) => { if (err) alert(err); });
              }
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
              label: `Timed out · ${remaining} left`,
              icon: <IconTimer size={16} />,
              disabled: true,
              onClick: () => {},
            });
            items.push({
              id: "timeout-remove",
              label: "Remove Timeout",
              icon: <IconTimer size={16} />,
              onClick: () => {
                void app.removeMemberTimeout(member.user_id).then((err) => { if (err) alert(err); });
              },
            });
          } else {
            items.push({
              id: "timeout",
              label: "Time out…",
              icon: <IconTimer size={16} />,
              onClick: () => {
                if (member.profile) setTimeoutTarget({ userId: member.user_id, profile: member.profile });
              },
            });
          }
        }
      }

      if (canManageRoles && app.serverRoles.length > 0) {
        const memberRoleIds =
          member.role_ids && member.role_ids.length > 0
            ? member.role_ids
            : member.role_id
              ? [member.role_id]
              : [];
        app.serverRoles.filter((r) => !r.is_default).forEach((role) => {
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
                if (err) alert(err);
              });
            },
          });
        });
        if (memberRoleIds.length > 0) {
          items.push({
            id: "role-clear",
            label: "Clear all roles",
            icon: <IconClose size={16} />,
            onClick: () =>
              void app.setMemberRoles(member.user_id, []).then((err) => {
                if (err) alert(err);
              }),
          });
        }
      }

      openMenu(x, y, items);
    },
    [app, canKick, canBan, canManageRoles, openMenu, openProfile],
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
          label: "View Profile",
          icon: <IconFriends size={16} />,
          onClick: () => openProfile(profile),
        },
        {
          id: "dm",
          label: "Message",
          icon: <IconFriends size={16} />,
          onClick: () => void app.openDmWithFriend(profile.id),
        },
        {
          id: "copy",
          label: "Copy User ID",
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
          label: "View Profile",
          icon: <IconFriends size={16} />,
          onClick: () => openProfile(friend),
        },
        {
          id: "dm",
          label: "Message",
          icon: <IconFriends size={16} />,
          onClick: () => void app.openDmWithFriend(friend.id),
        },
        {
          id: "copy",
          label: "Copy User ID",
          icon: <IconCopy size={16} />,
          onClick: () => void navigator.clipboard.writeText(friend.id),
        },
        {
          id: "remove",
          label: "Remove Friend",
          icon: <IconLeave size={16} />,
          danger: true,
          onClick: () => {
            if (confirm(`Remove ${displayName(friend)} from your friends?`)) {
              void app.removeFriend(friend.id);
            }
          },
        },
        {
          id: "block",
          label: "Block",
          icon: <IconTrash size={16} />,
          danger: true,
          onClick: () => {
            if (confirm(`Block ${displayName(friend)}? They won't be able to message you.`)) {
              void app.blockUser(friend.id);
            }
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
  });

  const channelMessages: ChatMessageData[] = app.messages.map(mapChatMessage);
  const dmMessages: ChatMessageData[] = app.dmMessages.map(mapChatMessage);
  const groupMessages: ChatMessageData[] = app.groupMessages.map(mapChatMessage);

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

  const lastCallRef = useRef<{ kind: string; startedAt: number } | null>(null);
  useEffect(() => {
    const activeKind = dmCallActive ? "dm" : groupCall.joined ? "group" : app.voiceJoinedChannelId ? "voice" : null;
    if (!activeKind) {
      lastCallRef.current = null;
      setCallIndicatorState({ active: false, kind: null, label: "", startedAt: null, hangup: null, focus: null });
      return;
    }
    if (!lastCallRef.current || lastCallRef.current.kind !== activeKind) {
      lastCallRef.current = { kind: activeKind, startedAt: Date.now() };
    }
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
      startedAt: lastCallRef.current.startedAt,
      hangup,
      focus,
    });
  }, [
    dmCallActive,
    groupCall.joined,
    app.voiceJoinedChannelId,
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
          subtitle={call.phase === "outgoing" ? "Calling… waiting for answer" : "Connected — you're live"}
          phase={call.phase === "outgoing" ? "outgoing" : "active"}
          localStream={call.localStream}
          remoteStream={call.remoteStream}
          localScreen={call.localScreen}
          remoteScreen={call.remoteScreen}
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

  return (
    <div className="h-screen w-screen overflow-hidden bg-bg-primary">
      <div
        className="h-full w-full origin-top-left"
        style={{ transform: `scale(${zoom})`, width: `${100 / zoom}%`, height: `${100 / zoom}%` }}
      >
        <div className={`relative flex h-full w-full overflow-hidden ${isMobile ? "pt-10" : ""}`}>
      {isMobile && (
        <div className="absolute inset-x-0 top-0 z-[60] flex h-10 items-center gap-2 border-b border-divider bg-bg-tertiary px-2">
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-normal hover:bg-interactive-hover"
          >
            <IconMenu size={22} />
          </button>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-normal">
            {mobileTitle}
          </span>
          <button
            type="button"
            aria-label="Settings"
            onClick={() => setSettingsOpen(true)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-interactive-hover hover:text-text-normal"
          >
            <IconSettings size={20} />
          </button>
        </div>
      )}

      {!online && (
        <div className="fixed left-0 right-0 top-0 z-[100] bg-status-dnd px-4 py-2 text-center text-sm font-medium text-white">
          You are offline. Messages will send when your connection returns.
        </div>
      )}
      {checkoutSuccess && (
        <div className="fixed left-0 right-0 top-0 z-[100] bg-[#57f287] px-4 py-2 text-center text-sm font-medium text-black">
          Subscription activated successfully!
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
        <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
      )}

      {call.callNotice && (
        <div className="fixed bottom-6 left-1/2 z-[95] flex -translate-x-1/2 items-center gap-3 rounded-lg border border-divider bg-bg-secondary px-4 py-3 text-sm shadow-xl">
          <span>{call.callNotice}</span>
          {call.canRetryCall && (
            <button
              type="button"
              onClick={() => void call.retryCall()}
              className="shrink-0 rounded-md bg-brand px-2.5 py-1 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              Retry
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
            <div className="relative flex h-full w-[min(86vw,22rem)] shadow-2xl">
              <ServerList
                servers={app.servers}
                activeServerId={app.activeServerId}
                viewMode={app.viewMode}
                dmUnreads={app.dmUnreads}
                activeDmThreadId={app.activeDmThreadId}
                serverUnreadIds={app.serverUnreadIds}
                folders={app.serverFolders}
                listState={app.serverListState}
                onSelectHome={app.setViewHome}
                onSelectServer={(id) => void app.selectServer(id)}
                onSelectDmThread={(id) => void app.selectDmThread(id)}
                onCreateServer={() => setCreateServerOpen(true)}
                onDiscover={app.setViewDiscover}
                onServerContext={handleServerContext}
                onFolderContext={handleFolderContext}
                onReorderServers={handleReorderServers}
                onReorderFolders={handleReorderFolders}
              />

              {app.viewMode === "discover" ? (
                <DiscoverSidebar
                  tab={discoverTab}
                  onTabChange={setDiscoverTab}
                  query={discoverQuery}
                  onQueryChange={setDiscoverQuery}
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
                  onOpenSubscription={() => setSubscriptionOpen(true)}
                  onOpenShop={() => setShopOpen(true)}
                />
              ) : (
                <ChannelList
                  title={app.activeServer?.name ?? "Space"}
                  verified={app.activeServer?.verified}
                  categories={app.categories}
                  channels={visibleChannels}
                  activeChannelId={app.activeChannelId}
                  getUnreadCount={app.getChannelUnreadCount}
                  getMentionCount={app.getChannelMentionCount}
                  canManageChannels={canManageChannels}
                  voicePresence={serverVoicePresence.byChannel}
                  voiceStartTimes={serverVoicePresence.startTimes}
                  onSelectChannel={handleSelectChannel}
                  onOpenSettings={() => setSettingsOpen(true)}
                  onOpenProfile={app.profile ? () => openProfile(app.profile!) : undefined}
                  onOpenServerSettings={() => setServerSettingsOpen(true)}
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
        )
      ) : (
        <>
          {/* A column so the UserPanel can span the rail and the panel beside
              it. The rail and the panel are a ROW inside it — nesting them
              directly in the column stacked them vertically, which collapsed
              the panel to its header.

              The width is pinned to the rail (72px) plus a panel (w-60 = 240px)
              rather than left to auto. On auto the column takes its widest
              child's max-content, and the UserPanel's name and custom status
              have no natural limit — a long status widened the whole column and
              opened a gap beside the chat. A definite width is also what lets
              the `truncate` inside the UserPanel do anything at all. */}
          <div className="relative flex h-full min-h-0 w-[312px] shrink-0 flex-col">
            <div className="flex min-h-0 flex-1">
              <ServerList
                servers={app.servers}
                activeServerId={app.activeServerId}
                viewMode={app.viewMode}
                dmUnreads={app.dmUnreads}
                activeDmThreadId={app.activeDmThreadId}
                serverUnreadIds={app.serverUnreadIds}
                folders={app.serverFolders}
                listState={app.serverListState}
                onSelectHome={app.setViewHome}
                onSelectServer={(id) => void app.selectServer(id)}
                onSelectDmThread={(id) => void app.selectDmThread(id)}
                onCreateServer={() => setCreateServerOpen(true)}
                onDiscover={app.setViewDiscover}
                onServerContext={handleServerContext}
                onFolderContext={handleFolderContext}
                onReorderServers={handleReorderServers}
                onReorderFolders={handleReorderFolders}
              />

              {app.viewMode === "discover" ? (
                <div className="flex min-h-0">
                  <DiscoverSidebar
                    tab={discoverTab}
                    onTabChange={setDiscoverTab}
                    query={discoverQuery}
                    onQueryChange={setDiscoverQuery}
                    onOpenSettings={() => setSettingsOpen(true)}
                    onOpenProfile={app.profile ? () => openProfile(app.profile!) : undefined}
                  />
                </div>
              ) : app.viewMode === "home" || app.viewMode === "dm" || app.viewMode === "group" || app.viewMode === "notes" ? (
                <div className="flex min-h-0">
                  <HomePanel
                    onOpenSettings={() => setSettingsOpen(true)}
                    onOpenProfile={app.profile ? () => openProfile(app.profile!) : undefined}
                    onFriendClick={(id) => {
                      const f = app.friends.find((x) => x.id === id);
                      if (f) openProfile(f);
                    }}
                    onGroupContext={handleGroupContext}
                    onOpenSubscription={() => setSubscriptionOpen(true)}
                  />
                </div>
              ) : (
                <div className="flex min-h-0">
                  <ChannelList
                    title={app.activeServer?.name ?? "Space"}
                    verified={app.activeServer?.verified}
                    categories={app.categories}
                    channels={app.channels}
                    activeChannelId={app.activeChannelId}
                    getUnreadCount={app.getChannelUnreadCount}
                    getMentionCount={app.getChannelMentionCount}
                    canManageChannels={canManageChannels}
                    voicePresence={serverVoicePresence.byChannel}
                    voiceStartTimes={serverVoicePresence.startTimes}
                    onSelectChannel={handleSelectChannel}
                    onOpenSettings={() => setSettingsOpen(true)}
                    onOpenProfile={app.profile ? () => openProfile(app.profile!) : undefined}
                    onOpenServerSettings={() => setServerSettingsOpen(true)}
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
            <UserPanel onOpenSettings={() => setSettingsOpen(true)} onOpenProfile={app.profile ? () => openProfile(app.profile!) : undefined} onContextMenu={handleUserPanelContext} />
          </div>
        </>
      )}

      {app.viewMode === "dm" && dmFriend && (
        <>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <ChatCanvas
            key={app.activeDmThreadId}
            ref={dmChatRef}
            channelName={displayName(dmFriend)}
            messages={dmMessages}
            loading={app.dmLoading}
            members={[dmFriend, ...(app.profile ? [app.profile] : [])]}
            currentUserId={app.user?.id}
            currentUserName={app.profile ? displayName(app.profile) : undefined}
            messageContext="dm"
            reactions={app.messageReactions}
            typingScope={{ kind: "dm", id: app.activeDmThreadId! }}
            readCursorScope={{ kind: "dm", id: app.activeDmThreadId! }}
            headerTrailing={
              !dmCallActive ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setShowDmProfile((v) => !v)}
                    title={showDmProfile ? "Hide profile panel" : "Show profile panel"}
                    aria-pressed={showDmProfile}
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all hover:bg-interactive-hover ${
                      showDmProfile ? "text-brand" : "text-text-muted hover:text-text-normal"
                    }`}
                  >
                    <IconFriends size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPinnedOpen(true);
                      if (app.activeDmThreadId) void app.loadPinnedMessages("dm", app.activeDmThreadId);
                    }}
                    title="Pinned messages"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted transition-all hover:bg-interactive-hover hover:text-text-normal"
                  >
                    <IconPin size={18} />
                  </button>
                  <HeaderCallButton
                    disabled={call.phase !== "idle" || groupCall.phase !== "idle"}
                    onClick={() => void startVoiceCall(dmFriend)}
                  />
                </div>
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
          {showDmProfile && (
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
          <p className="text-[15px] font-semibold text-text-normal">Conversation unavailable</p>
          <p className="max-w-sm text-sm text-text-muted">
            This conversation may have been deleted, or you may no longer have access to it.
          </p>
          <button
            type="button"
            onClick={() => app.setViewHome()}
            className="mt-1 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
          >
            Back to friends
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
                remoteScreens={groupCall.remoteScreens}
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
                channelName={activeGroup.name}
                messages={groupMessages}
                loading={app.groupLoading}
                members={activeGroup.members}
                currentUserId={app.user?.id}
                currentUserName={app.profile ? displayName(app.profile) : undefined}
                messageContext="group"
                reactions={app.messageReactions}
                typingScope={{ kind: "group", id: app.activeGroupChatId! }}
                readCursorScope={{ kind: "group", id: app.activeGroupChatId! }}
                headerTrailing={
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setPinnedOpen(true);
                        if (app.activeGroupChatId) void app.loadPinnedMessages("group", app.activeGroupChatId);
                      }}
                      title="Pinned messages"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted transition-all hover:bg-interactive-hover hover:text-text-normal"
                    >
                      <IconPin size={18} />
                    </button>
                    <HeaderCallButton
                      disabled={call.phase !== "idle" || groupCall.phase !== "idle"}
                      onClick={startGroupVoiceCall}
                    />
                  </div>
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
          <div className="hidden min-h-0 w-60 shrink-0 flex-col bg-bg-secondary lg:flex">
            <GroupMemberList
              members={activeGroup.members}
              ownerId={activeGroup.owner_id}
              inCallUserIds={groupCall.inCallUserIds}
              currentUserId={app.user?.id}
              onMemberClick={(p) => openProfile(p)}
              onMemberContext={handleGroupMemberContext}
            />
          </div>
        </>
      )}

      {app.viewMode === "group" && !activeGroup && (
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 bg-bg-primary px-6 text-center">
          <p className="text-[15px] font-semibold text-text-normal">Conversation unavailable</p>
          <p className="max-w-sm text-sm text-text-muted">
            This group may have been deleted, or you may no longer be a member.
          </p>
          <button
            type="button"
            onClick={() => app.setViewHome()}
            className="mt-1 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
          >
            Back to friends
          </button>
        </div>
      )}

      {app.viewMode === "notes" && (
        <ChatCanvas
          key="notes"
          ref={notesChatRef}
          channelName="Notes"
          channelIcon={<IconNotes size={22} className="text-text-muted" />}
          introText="Your private Notes — only you can see this"
          placeholder="Write a note, or drop in an image, video or file…"
          messages={noteMessages}
          members={app.profile ? [app.profile] : []}
          currentUserId={app.user?.id}
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

      {app.viewMode === "home" && (
        <>
          <FriendsPanel onOpenProfile={openProfile} onFriendContext={handleFriendContext} />
          <ActiveNowPanel />
        </>
      )}

      {app.viewMode === "discover" && <DiscoverPanel tab={discoverTab} query={discoverQuery} />}

      {app.viewMode === "space" && activeChannel && isVoice && (
        <VoicePanel
          channelId={activeChannel.id}
          channelName={activeChannel.name}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}

      {app.viewMode === "space" && activeChannel && !isVoice && (
        <ChatCanvas
          key={app.activeChannelId}
          ref={channelChatRef}
          channelName={activeChannel.name}
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
          members={app.members.map((m) => m.profile)}
          roles={app.serverRoles}
          customEmoji={app.customEmojiMap}
          channels={app.channels}
          onChannelClick={(id) => void app.selectChannel(id)}
          currentUserId={app.user?.id}
          currentUserName={app.profile ? displayName(app.profile) : undefined}
          messageContext="channel"
          reactions={app.messageReactions}
          reactionsEnabled={canManageChannels ? true : (activeChannelEffect?.can_react ?? true)}
          typingScope={{ kind: "channel", id: activeChannel.id, serverId: activeChannel.server_id }}
          readCursorScope={{ kind: "channel", id: activeChannel.id }}
          getAuthorColor={getAuthorColor}
          onSend={app.sendChannelMessage}
          onEdit={app.editChannelMessage}
          onToggleReaction={(id, emoji) => void app.toggleReaction("channel", id, emoji)}
          onMessageContext={(m, x, y) => handleMessageContext(m, x, y, "channel")}
          onForward={(m) => setForwardMessage(m)}
          onAuthorClick={handleAuthorClick}
          onAuthorContextMenu={handleAuthorContext}
          hasMore={app.channelHasMore}
          onLoadMore={app.loadMoreChannelMessages}
        />
      )}

      {app.viewMode === "space" && !activeChannel && (
        <div className="flex min-w-0 flex-1 items-center justify-center bg-bg-primary px-6 text-center">
          <p className="text-[15px] text-text-muted">
            {app.channels.length ? "Pick a channel to start talking." : "This space has no channels yet."}
          </p>
        </div>
      )}

      {app.viewMode === "space" && !isMobile && (
        <MemberList
          members={app.members}
          roles={app.serverRoles}
          onMemberClick={(m) => openProfile(m.profile)}
          onMemberContext={handleMemberContext}
        />
      )}

      <UserProfileModal
        profile={profileTarget}
        open={!!profileTarget}
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
                void app.openDmWithFriend(profileTarget.id);
                setProfileTarget(null);
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
                  if (err) alert(err);
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
                if (confirm(`Remove ${displayName(profileTarget)} as a friend?`)) {
                  void app.removeFriend(profileTarget.id).then(() => setProfileTarget(null));
                }
              }
            : undefined
        }
        onBlock={
          profileTarget && !app.isBlocked(profileTarget.id)
            ? () => {
                if (confirm(`Block ${displayName(profileTarget)}?`)) {
                  void app.blockUser(profileTarget.id).then((err) => {
                    if (err) alert(err);
                    else setProfileTarget(null);
                  });
                }
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
        isServerMember={!!profileServerMember}
        serverRoles={app.serverRoles}
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
                  if (err) alert(err);
                });
              }
            : undefined
        }
      />

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <CatalystModal
        server={app.servers.find((s) => s.id === catalystServerId) ?? null}
        open={catalystServerId !== null}
        onClose={() => setCatalystServerId(null)}
      />
      <SubscriptionModal
        open={subscriptionOpen}
        onClose={() => setSubscriptionOpen(false)}
        userId={app.user?.id}
      />
      <ShopModal
        open={shopOpen}
        onClose={() => setShopOpen(false)}
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

      <CreateServerModal open={createServerOpen} onClose={() => setCreateServerOpen(false)} />
      {folderDialog && (
        <ServerFolderDialog
          title={folderDialog.mode === "create" ? "Create Folder" : "Edit Folder"}
          initialName={
            folderDialog.mode === "edit"
              ? (app.serverFolders.find((f) => f.id === folderDialog.folderId)?.name ?? "")
              : pendingFolderServer
                ? `${pendingFolderServer.name}`
                : ""
          }
          initialColor={
            folderDialog.mode === "edit"
              ? (app.serverFolders.find((f) => f.id === folderDialog.folderId)?.color ?? "#5865f2")
              : "#5865f2"
          }
          onClose={() => {
            setFolderDialog(null);
            setPendingFolderServer(null);
          }}
          onSave={async (name, color) => {
            if (folderDialog.mode === "create") {
              const id = await app.createFolder(name, color);
              if (typeof id === "string" && pendingFolderServer) {
                const members = app.serverListState.filter((s) => s.folder_id === id);
                await app.setServerSlot(pendingFolderServer.id, members.length, id);
              }
            } else if (folderDialog.folderId) {
              const err = await app.renameFolder(folderDialog.folderId, name);
              if (!err) await app.setFolderColor(folderDialog.folderId, color);
              if (err) throw new Error(err);
            }
          }}
        />
      )}
      <ServerSettingsModal
        open={serverSettingsOpen}
        onClose={() => setServerSettingsOpen(false)}
        onEditChannel={(ch) => {
          setServerSettingsOpen(false);
          setChannelSettingsChannel(app.channels.find((c) => c.id === ch.id) ?? null);
        }}
      />
      <ChannelSettingsModal
        channel={channelSettingsChannel}
        onClose={() => setChannelSettingsChannel(null)}
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
        threadName={dmFriend ? displayName(dmFriend) : ""}
        pins={app.activeDmThreadId ? app.pinnedBySource[`dm:${app.activeDmThreadId}`] ?? [] : []}
        onClose={() => setPinnedOpen(false)}
        onUnpin={(messageId) => {
          if (app.activeDmThreadId) void app.unpinMessage("dm", app.activeDmThreadId, messageId);
        }}
      />
        </div>
      </div>
    </div>
  );
}

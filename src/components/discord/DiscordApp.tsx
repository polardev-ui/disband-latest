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
import { ChannelList } from "./ChannelList";
import { HomePanel } from "./HomePanel";
import { DiscoverPanel, DiscoverSidebar, type DiscoverTab } from "./DiscoverPanel";
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
import { SettingsModal } from "./SettingsModal";
import { CreateServerModal } from "@/components/modals/CreateServerModal";
import { ServerSettingsModal } from "@/components/modals/ServerSettingsModal";
import { ChannelSettingsModal } from "@/components/modals/ChannelSettingsModal";
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
} from "@/components/icons";
import { SubscriptionModal } from "@/components/subscription/SubscriptionModal";
import { displayName, getInviteUrl, normalizeMessageContent } from "@/lib/utils";
import type { Channel, ChannelCategory, Profile, Server } from "@/lib/supabase/types";
import type { MessageContext } from "@/lib/messages";
import type { ChatMessageData } from "./ChatMessage";
import { ForwardModal, type ForwardDestination } from "./ForwardModal";
import { PinnedMessagesPanel } from "./PinnedMessagesPanel";

export function DiscordApp() {
  const app = useApp();
  const { openMenu } = useContextMenu();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [discoverTab, setDiscoverTab] = useState<DiscoverTab>("popular");
  const [discoverQuery, setDiscoverQuery] = useState("");
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const [createServerOpen, setCreateServerOpen] = useState(false);
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false);
  const [channelSettingsChannel, setChannelSettingsChannel] = useState<Channel | null>(null);
  const [profileTarget, setProfileTarget] = useState<Profile | null>(null);
  const [inviteGroupOpen, setInviteGroupOpen] = useState(false);
  const [inviteGroupId, setInviteGroupId] = useState<string | null>(null);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);
  const [forwardMessage, setForwardMessage] = useState<ChatMessageData | null>(null);
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

  // Opening a server should land you somewhere. `selectServer` already picks
  // the last channel you used, but it is not the only way into a server — a
  // restored session or an invite lands here with a server and no channel, and
  // the app then showed an empty pane. This is the backstop for every route:
  // the channel you were last in, else the first text channel.
  useEffect(() => {
    if (app.viewMode !== "server") return;
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
      case "server":
        return activeChannel ? `#${activeChannel.name}` : (app.activeServer?.name ?? "Server");
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
    app.viewMode === "server" && (isServerOwner || app.serverPermissions.manage_roles);

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
      const items: ContextMenuItem[] = [
        {
          id: "settings",
          label: "Server Settings",
          icon: <IconSettings size={16} />,
          onClick: () => setServerSettingsOpen(true),
        },
        {
          id: "copy-id",
          label: "Copy Server ID",
          icon: <IconCopy size={16} />,
          onClick: () => void navigator.clipboard.writeText(server.id),
        },
        ...(server.invite_code
          ? [
              {
                id: "invite",
                label: "Copy Invite Link",
                icon: <IconCopy size={16} />,
                onClick: () => void navigator.clipboard.writeText(getInviteUrl(server.invite_code!)),
              },
            ]
          : []),
        ...(subPlan === "super" && app.user?.id
          ? [
              {
                id: "boost",
                label: "Boost Server",
                icon: <IconStar size={16} />,
                onClick: () => void boostServer(server.id),
              } as ContextMenuItem,
            ]
          : []),
        {
          id: "leave",
          label: "Leave Server",
          icon: <IconLeave size={16} />,
          onClick: () => void app.leaveServer(server.id),
        },
        ...(isOwner
          ? [
              {
                id: "delete",
                label: "Delete Server",
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

  const boostServer = useCallback(
    async (serverId: string) => {
      if (!app.user?.id) return;
      const supabase = (await import("@/lib/supabase/client")).getSupabaseClient();
      // Check if already boosted
      const { data: existing } = await supabase
        .from("server_boosts")
        .select("id")
        .eq("server_id", serverId)
        .eq("user_id", app.user.id)
        .maybeSingle();
      if (existing) {
        await supabase.from("server_boosts").delete().eq("id", existing.id);
      } else {
        await supabase.from("server_boosts").insert({ server_id: serverId, user_id: app.user.id });
      }
    },
    [app],
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
          label: "Copy Server ID",
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
        app.viewMode === "server"
        && (app.activeServer?.owner_id === app.user?.id || !!app.serverPermissions.manage_messages);
      const chatRef =
        context === "dm" ? dmChatRef : context === "group" ? groupChatRef : channelChatRef;
      const pinnedForSource = app.activeDmThreadId
        ? app.pinnedBySource[`dm:${app.activeDmThreadId}`]
        : undefined;
      const isPinned = pinnedForSource?.some((p) => p.message_id === message.id) ?? false;

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
        // Moderators and the owner can remove anyone's message in a server
        // channel. The database has always allowed this — the delete policy
        // accepts the author or `manage_messages`, and an owner satisfies every
        // permission — but the menu only ever offered it on your own messages,
        // so there was no way to act on someone else's. DMs and group chats
        // stay author-only: nobody moderates a private conversation.
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
    reply_to_id: m.reply_to_id ?? null,
    edited_at: m.edited_at ?? null,
    created_at: m.created_at,
    mentions: m.mentions ?? [],
    author: m.author ?? undefined,
  });

  const channelMessages: ChatMessageData[] = app.messages.map(mapChatMessage);
  const dmMessages: ChatMessageData[] = app.dmMessages.map(mapChatMessage);
  const groupMessages: ChatMessageData[] = app.groupMessages.map(mapChatMessage);

  // Notes have no author column — they are all yours — so the current profile is
  // attached here to satisfy the shared message renderer.
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

  // Publish the current call to the persistent indicator above the user panel.
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
    // Only render the call UI inside the DM it actually belongs to. Switching
    // to another DM, GC or server must not drag the call panel along — the
    // indicator pill above the user panel handles returning to the call.
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
          connectedAt={call.connectedAt}
          micMuted={app.micMuted}
          deafened={app.deafened}
          cameraEnabled={call.cameraEnabled}
          screenShareEnabled={call.screenShareEnabled}
          onToggleMic={toggleMic}
          onToggleDeafen={toggleDeafen}
          onToggleCamera={() => void call.toggleCamera()}
          onToggleScreenShare={subPlan === "super" ? () => void call.toggleScreenShare() : undefined}
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
        <div className="fixed bottom-6 left-1/2 z-[95] -translate-x-1/2 rounded-lg border border-divider bg-bg-secondary px-4 py-3 text-sm shadow-xl">
          {call.callNotice}
        </div>
      )}
      {isMobile ? (
        mobileMenuOpen && (
          <div className="absolute inset-0 z-40">
            <div
              className="absolute inset-0 bg-black/60"
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
                onSelectHome={app.setViewHome}
                onSelectServer={(id) => void app.selectServer(id)}
                onSelectDmThread={(id) => void app.selectDmThread(id)}
                onCreateServer={() => setCreateServerOpen(true)}
                onDiscover={app.setViewDiscover}
                onServerContext={handleServerContext}
              />

              {app.viewMode === "discover" ? (
                <DiscoverSidebar
                  tab={discoverTab}
                  onTabChange={setDiscoverTab}
                  query={discoverQuery}
                  onQueryChange={setDiscoverQuery}
                  onOpenSettings={() => setSettingsOpen(true)}
                  onOpenProfile={app.profile ? () => openProfile(app.profile!) : undefined}
                  onUserPanelContext={handleUserPanelContext}
                />
              ) : app.viewMode === "home" || app.viewMode === "dm" || app.viewMode === "group" || app.viewMode === "notes" ? (
                <HomePanel
                  onOpenSettings={() => setSettingsOpen(true)}
                  onOpenProfile={app.profile ? () => openProfile(app.profile!) : undefined}
                  onUserPanelContext={handleUserPanelContext}
                  onFriendClick={(id) => {
                    const f = app.friends.find((x) => x.id === id);
                    if (f) openProfile(f);
                  }}
                  onGroupContext={handleGroupContext}
                  onOpenSubscription={() => setSubscriptionOpen(true)}
                />
              ) : (
                <ChannelList
                  title={app.activeServer?.name ?? "Server"}
                  verified={app.activeServer?.verified}
                  categories={app.categories}
                  channels={visibleChannels}
                  activeChannelId={app.activeChannelId}
                  canManageChannels={canManageChannels}
                  voicePresence={serverVoicePresence}
                  onSelectChannel={handleSelectChannel}
                  onOpenSettings={() => setSettingsOpen(true)}
                  onOpenProfile={app.profile ? () => openProfile(app.profile!) : undefined}
                  onOpenServerSettings={() => setServerSettingsOpen(true)}
                  onChannelContext={handleChannelContext}
                  onCategoryContext={handleCategoryContext}
                  onUserPanelContext={handleUserPanelContext}
                  onMoveChannel={(channelId, categoryId, index) => void app.moveChannel(channelId, categoryId, index)}
                  onCreateChannel={(name, type, categoryId) => app.createChannel({ name, type, categoryId })}
                  onCreateCategory={(name) => app.createCategory(name)}
                />
              )}
            </div>
          </div>
        )
      ) : (
        <>
          <ServerList
            servers={app.servers}
            activeServerId={app.activeServerId}
            viewMode={app.viewMode}
            dmUnreads={app.dmUnreads}
            activeDmThreadId={app.activeDmThreadId}
            serverUnreadIds={app.serverUnreadIds}
            onSelectHome={app.setViewHome}
            onSelectServer={(id) => void app.selectServer(id)}
            onSelectDmThread={(id) => void app.selectDmThread(id)}
            onCreateServer={() => setCreateServerOpen(true)}
            onDiscover={app.setViewDiscover}
            onServerContext={handleServerContext}
          />

          {app.viewMode === "discover" ? (
                <DiscoverSidebar
                  tab={discoverTab}
                  onTabChange={setDiscoverTab}
                  query={discoverQuery}
                  onQueryChange={setDiscoverQuery}
                  onOpenSettings={() => setSettingsOpen(true)}
                  onOpenProfile={app.profile ? () => openProfile(app.profile!) : undefined}
                  onUserPanelContext={handleUserPanelContext}
                />
              ) : app.viewMode === "home" || app.viewMode === "dm" || app.viewMode === "group" || app.viewMode === "notes" ? (
            <HomePanel
              onOpenSettings={() => setSettingsOpen(true)}
              onOpenProfile={app.profile ? () => openProfile(app.profile!) : undefined}
              onUserPanelContext={handleUserPanelContext}
              onFriendClick={(id) => {
                const f = app.friends.find((x) => x.id === id);
                if (f) openProfile(f);
              }}
              onGroupContext={handleGroupContext}
              onOpenSubscription={() => setSubscriptionOpen(true)}
            />
          ) : (
            <ChannelList
              title={app.activeServer?.name ?? "Server"}
              verified={app.activeServer?.verified}
              categories={app.categories}
              channels={app.channels}
              activeChannelId={app.activeChannelId}
              canManageChannels={canManageChannels}
              voicePresence={serverVoicePresence}
              onSelectChannel={handleSelectChannel}
              onOpenSettings={() => setSettingsOpen(true)}
              onOpenProfile={app.profile ? () => openProfile(app.profile!) : undefined}
              onOpenServerSettings={() => setServerSettingsOpen(true)}
              onChannelContext={handleChannelContext}
              onCategoryContext={handleCategoryContext}
              onUserPanelContext={handleUserPanelContext}
              onMoveChannel={(channelId, categoryId, index) => void app.moveChannel(channelId, categoryId, index)}
              onCreateChannel={(name, type, categoryId) => app.createChannel({ name, type, categoryId })}
              onCreateCategory={(name) => app.createCategory(name)}
            />
          )}
        </>
      )}

      {app.viewMode === "dm" && dmFriend && (
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
      )}

      {/* Group chat: the call stage is conditional on the group and call matching,
          but the chat canvas and member list persist regardless of call state.
          Previously the entire block was gated on groupCall.groupId === activeGroup.id,
          which nuked the chat UI when the call ended (cleanup sets groupId=null). */}
      {app.viewMode === "group" && activeGroup && (
        <>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {groupCall.groupId === activeGroup.id && (
              <GroupCallStage
                groupName={activeGroup.name}
                members={activeGroup.members}
                presence={groupCall.presence}
                inCallUserIds={groupCall.inCallUserIds}
                ringingIds={groupCall.ringingIds}
                joined={groupCall.joined}
                selfId={app.user?.id}
                localStream={groupCall.localStream}
                remoteStreams={groupCall.remoteStreams}
                cameraEnabled={groupCall.cameraEnabled}
                micMuted={app.micMuted}
                deafened={app.deafened}
                onJoin={() => void groupCall.joinGroupCall(activeGroup.id, activeGroup.name)}
                onLeave={() => void groupCall.endGroupCall()}
                onToggleCamera={() => void groupCall.toggleCamera()}
                onToggleMic={toggleMic}
              />
            )}
            <ChatCanvas
              key={app.activeGroupChatId}
              ref={groupChatRef}
              channelName={activeGroup.name}
              channelIcon={<IconGroup size={22} className="text-text-muted" />}
              messages={groupMessages}
              loading={app.groupLoading}
              members={activeGroup.members}
              currentUserId={app.user?.id}
              messageContext="group"
              reactions={app.messageReactions}
              readCursorScope={{ kind: "group", id: activeGroup.id }}
              headerTrailing={
                !groupCall.joined ? (
                  <HeaderCallButton
                    disabled={call.phase !== "idle"}
                    onClick={() => {
                      if (groupVoiceLive) void groupCall.joinGroupCall(activeGroup.id, activeGroup.name);
                      else startGroupVoiceCall();
                    }}
                  />
                ) : null
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
          </div>
          {!isMobile && (
            <GroupMemberList
              members={activeGroup.members}
              ownerId={activeGroup.owner_id}
              inCallUserIds={groupCall.inCallUserIds}
              currentUserId={app.user?.id}
              onMemberClick={openProfile}
            />
          )}
        </>
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

      {app.viewMode === "server" && activeChannel && isVoice && (
        <VoicePanel
          channelId={activeChannel.id}
          channelName={activeChannel.name}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}

      {app.viewMode === "server" && activeChannel && !isVoice && (
        <ChatCanvas
          key={app.activeChannelId}
          ref={channelChatRef}
          channelName={activeChannel.name}
          composerLockedReason={
            activeChannel.read_only && !canManageChannels
              ? "This is an announcement channel. Only people who can manage channels may post here."
              : !canManageChannels && activeChannelEffect && !activeChannelEffect.can_post
                ? "You don't have permission to post in this channel."
                : null
          }
          messages={channelMessages}
          loading={app.messagesLoading}
          members={app.members.map((m) => m.profile)}
          roles={app.serverRoles}
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
          hasMore={app.channelHasMore}
          onLoadMore={app.loadMoreChannelMessages}
        />
      )}

      {/* Holds the middle column open when no channel is selected. Without it
          the member list slides left into the chat's place, which is what made
          opening a server look broken. */}
      {app.viewMode === "server" && !activeChannel && (
        <div className="flex min-w-0 flex-1 items-center justify-center bg-bg-primary px-6 text-center">
          <p className="text-[15px] text-text-muted">
            {app.channels.length ? "Pick a channel to start talking." : "This server has no channels yet."}
          </p>
        </div>
      )}

      {app.viewMode === "server" && !isMobile && (
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
        onAddFriend={
          profileTarget && !profileFriend && !profilePendingIncoming && !profilePendingOutgoing && profileTarget.username
            ? () => {
                void app.sendFriendRequest(profileTarget.username!);
                setProfileTarget(null);
              }
            : undefined
        }
        onAcceptFriend={
          profileIncomingRequestId
            ? () => {
                void app.respondFriendRequest(profileIncomingRequestId, true);
                setProfileTarget(null);
              }
            : undefined
        }
        onDeclineFriend={
          profileIncomingRequestId
            ? () => {
                void app.respondFriendRequest(profileIncomingRequestId, false);
                setProfileTarget(null);
              }
            : undefined
        }
        onVoiceCall={
          profileTarget && profileFriend && !app.isBlockedEitherWay(profileTarget.id)
            ? () => {
                void startVoiceCall(profileTarget);
                setProfileTarget(null);
              }
            : undefined
        }
        onRemoveFriend={
          profileTarget && profileFriend
            ? () => {
                if (confirm(`Remove ${displayName(profileTarget)} as a friend?`)) {
                  void app.removeFriend(profileTarget.id);
                  setProfileTarget(null);
                }
              }
            : undefined
        }
        onBlock={
          profileTarget && profileTarget.id !== app.user?.id && !app.isBlocked(profileTarget.id)
            ? () => {
                if (confirm(`Block ${displayName(profileTarget)}? They won't be able to message or call you.`)) {
                  void app.blockUser(profileTarget.id).then((err) => { if (err) alert(err); });
                  setProfileTarget(null);
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
      <SubscriptionModal
        open={subscriptionOpen}
        onClose={() => setSubscriptionOpen(false)}
        userId={app.user?.id}
      />
      <CreateServerModal open={createServerOpen} onClose={() => setCreateServerOpen(false)} />
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

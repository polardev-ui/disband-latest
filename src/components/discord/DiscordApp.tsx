"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyAudioOutputToElement, getPreferredAudioOutputId } from "@/lib/audio-settings";
import { useApp } from "@/contexts/AppContext";
import { requestNotificationPermissionFromGesture } from "@/lib/notifications";
import { useCallManager } from "@/hooks/useCallManager";
import { useGroupCallManager } from "@/hooks/useGroupCallManager";
import { useContextMenu, type ContextMenuItem } from "@/components/ui/ContextMenu";
import { ServerList } from "./ServerList";
import { ChannelList } from "./ChannelList";
import { HomePanel } from "./HomePanel";
import { ChatCanvas, type ChatCanvasHandle } from "./ChatCanvas";
import { VoicePanel } from "./VoicePanel";
import { MemberList } from "./MemberList";
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
import { UserProfileModal } from "@/components/modals/UserProfileModal";
import {
  IconCopy,
  IconLeave,
  IconSettings,
  IconTrash,
  IconFriends,
  IconGroup,
  IconPhone,
} from "@/components/icons";
import { displayName, getInviteUrl, normalizeMessageContent } from "@/lib/utils";
import type { Channel, Profile, Server } from "@/lib/supabase/types";
import type { MessageContext } from "@/lib/messages";
import type { ChatMessageData } from "./ChatMessage";

export function DiscordApp() {
  const app = useApp();
  const { openMenu } = useContextMenu();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createServerOpen, setCreateServerOpen] = useState(false);
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false);
  const [profileTarget, setProfileTarget] = useState<Profile | null>(null);
  const [inviteGroupOpen, setInviteGroupOpen] = useState(false);
  const [inviteGroupId, setInviteGroupId] = useState<string | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const channelChatRef = useRef<ChatCanvasHandle>(null);
  const dmChatRef = useRef<ChatCanvasHandle>(null);
  const groupChatRef = useRef<ChatCanvasHandle>(null);
  const [online, setOnline] = useState(true);

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

  const canModerate =
    app.activeServer?.owner_id === app.user?.id ||
    app.members.find((m) => m.user_id === app.user?.id)?.role === "admin";

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
      openMenu(x, y, [
        {
          id: "settings",
          label: "Server Settings",
          icon: <IconSettings size={16} />,
          onClick: () => setServerSettingsOpen(true),
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
      ]);
    },
    [app, openMenu],
  );

  const handleChannelContext = useCallback(
    (channel: Channel, x: number, y: number) => {
      openMenu(x, y, [
        {
          id: "copy",
          label: "Copy Channel ID",
          icon: <IconCopy size={16} />,
          onClick: () => void navigator.clipboard.writeText(channel.id),
        },
      ]);
    },
    [openMenu],
  );

  const startGroupVoiceCall = useCallback(() => {
    if (!activeGroup || !app.user) return;
    const memberIds = activeGroup.members.map((m) => m.id);
    void groupCall.startGroupCall(activeGroup.id, activeGroup.name, memberIds);
  }, [activeGroup, app.user, groupCall]);

  const handleMessageContext = useCallback(
    (message: ChatMessageData, x: number, y: number, context: MessageContext) => {
      const isOwn = message.author_id === app.user?.id;
      const chatRef =
        context === "dm" ? dmChatRef : context === "group" ? groupChatRef : channelChatRef;

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
          onClick: () => void navigator.clipboard.writeText(message.id),
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
        ...(isOwn
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

      if (canModerate && !isOwnerMember && member.user_id !== app.user?.id) {
        items.push(
          {
            id: "kick",
            label: "Kick",
            icon: <IconLeave size={16} />,
            onClick: () => {
              if (confirm(`Kick ${displayName(member.profile)}?`)) void app.kickMember(member.user_id);
            },
          },
          {
            id: "ban",
            label: "Ban",
            icon: <IconTrash size={16} />,
            danger: true,
            onClick: () => {
              if (confirm(`Ban ${displayName(member.profile)}?`)) void app.banMember(member.user_id);
            },
          },
        );
      }

      if (canModerate && app.serverRoles.length > 0) {
        app.serverRoles.forEach((role) => {
          items.push({
            id: `role-${role.id}`,
            label: `Assign ${role.name}`,
            icon: <IconSettings size={16} />,
            onClick: () => void app.assignMemberRole(member.user_id, role.id),
          });
        });
      }

      openMenu(x, y, items);
    },
    [app, canModerate, openMenu, openProfile],
  );

  const mapChatMessage = (m: {
    id: string;
    author_id: string;
    content: string;
    attachment_url: string | null;
    attachment_type: ChatMessageData["attachment_type"];
    attachment_name?: string | null;
    attachment_size?: number | null;
    reply_to_id?: string | null;
    edited_at?: string | null;
    created_at: string;
    author?: Profile;
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
    author: m.author,
  });

  const channelMessages: ChatMessageData[] = app.messages.map(mapChatMessage);
  const dmMessages: ChatMessageData[] = app.dmMessages.map(mapChatMessage);
  const groupMessages: ChatMessageData[] = app.groupMessages.map(mapChatMessage);

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

  const renderCallPanel = () => {
    if (dmCallActive && callBannerPeer) {
      return (
        <CallPanel
          peer={callBannerPeer}
          title={displayName(callBannerPeer)}
          subtitle={call.phase === "outgoing" ? "Calling… waiting for answer" : "Connected — you're live"}
          phase={call.phase === "outgoing" ? "outgoing" : "active"}
          localStream={call.localStream}
          remoteStream={call.remoteStream}
          micMuted={app.micMuted}
          deafened={app.deafened}
          cameraEnabled={call.cameraEnabled}
          onToggleMic={toggleMic}
          onToggleDeafen={toggleDeafen}
          onToggleCamera={() => void call.toggleCamera()}
          onEnd={() => void call.endCall()}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      );
    }
    if (groupCallActive && activeGroup) {
      return (
        <CallPanel
          title={activeGroup.name}
          subtitle={`${groupCall.presence.length} in voice`}
          phase="active"
          localStream={groupCall.localStream}
          remoteStreams={groupCall.remoteStreams}
          remoteLabels={groupRemoteLabels}
          micMuted={app.micMuted}
          deafened={app.deafened}
          cameraEnabled={groupCall.cameraEnabled}
          onToggleMic={toggleMic}
          onToggleDeafen={toggleDeafen}
          onToggleCamera={() => void groupCall.toggleCamera()}
          onEnd={() => void groupCall.endGroupCall()}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      );
    }
    return null;
  };

  return (
    <div className="relative flex h-screen w-screen overflow-hidden">
      {!online && (
        <div className="fixed left-0 right-0 top-0 z-[100] bg-status-dnd px-4 py-2 text-center text-sm font-medium text-white">
          You are offline. Messages will send when your connection returns.
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
        onServerContext={handleServerContext}
      />

      {app.viewMode === "home" || app.viewMode === "dm" || app.viewMode === "group" ? (
        <HomePanel
          onOpenSettings={() => setSettingsOpen(true)}
          onUserPanelContext={handleUserPanelContext}
          onFriendClick={(id) => {
            const f = app.friends.find((x) => x.id === id);
            if (f) openProfile(f);
          }}
          onGroupContext={handleGroupContext}
        />
      ) : (
        <ChannelList
          title={app.activeServer?.name ?? "Server"}
          categories={app.categories}
          channels={app.channels}
          activeChannelId={app.activeChannelId}
          onSelectChannel={handleSelectChannel}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenServerSettings={() => setServerSettingsOpen(true)}
          onChannelContext={handleChannelContext}
          onUserPanelContext={handleUserPanelContext}
        />
      )}

      {app.viewMode === "dm" && dmFriend && (
        <ChatCanvas
          ref={dmChatRef}
          channelName={displayName(dmFriend)}
          messages={dmMessages}
          members={[dmFriend, ...(app.profile ? [app.profile] : [])]}
          currentUserId={app.user?.id}
          currentUserName={app.profile ? displayName(app.profile) : undefined}
          messageContext="dm"
          reactions={app.messageReactions}
          typingScope={{ kind: "dm", id: app.activeDmThreadId! }}
          headerTrailing={
            !dmCallActive ? (
              <HeaderCallButton
                disabled={call.phase !== "idle" || groupCall.phase !== "idle"}
                onClick={() => void startVoiceCall(dmFriend)}
              />
            ) : null
          }
          callPanel={renderCallPanel()}
          onSend={app.sendDmMessage}
          onEdit={app.editDmMessage}
          onToggleReaction={(id, emoji) => void app.toggleReaction("dm", id, emoji)}
          onMessageContext={(m, x, y) => handleMessageContext(m, x, y, "dm")}
          onAuthorClick={handleAuthorClick}
          hasMore={app.dmHasMore}
          onLoadMore={app.loadMoreDmMessages}
        />
      )}

      {app.viewMode === "group" && activeGroup && (
        <>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
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
            <ChatCanvas
              ref={groupChatRef}
              channelName={activeGroup.name}
              channelIcon={<IconGroup size={22} className="text-text-muted" />}
              messages={groupMessages}
              members={activeGroup.members}
              currentUserId={app.user?.id}
              messageContext="group"
              reactions={app.messageReactions}
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
              onAuthorClick={handleAuthorClick}
              hasMore={app.groupHasMore}
              onLoadMore={app.loadMoreGroupMessages}
            />
          </div>
          <GroupMemberList
            members={activeGroup.members}
            ownerId={activeGroup.owner_id}
            inCallUserIds={groupCall.inCallUserIds}
            currentUserId={app.user?.id}
            onMemberClick={openProfile}
          />
        </>
      )}

      {dmCallActive && app.viewMode !== "dm" && (
        <div className="fixed left-[4.5rem] right-0 top-0 z-50 max-w-xl">
          {renderCallPanel()}
        </div>
      )}

      {(groupCall.joined || groupCall.presence.length > 0) && app.viewMode !== "group" && (() => {
        const callGroup = app.groupChats.find((g) => g.id === groupCall.groupId);
        if (!callGroup) return null;
        return (
        <div className="fixed left-[4.5rem] right-0 top-0 z-50 max-w-2xl shadow-2xl">
          <GroupCallStage
            groupName={callGroup.name}
            members={callGroup.members}
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
            onJoin={() => void groupCall.joinGroupCall(callGroup.id, callGroup.name)}
            onLeave={() => void groupCall.endGroupCall()}
            onToggleCamera={() => void groupCall.toggleCamera()}
            onToggleMic={toggleMic}
          />
        </div>
        );
      })()}

      {app.viewMode === "home" && (
        <main className="flex min-w-0 flex-1 flex-col items-center justify-center bg-bg-primary p-8 text-center">
          <IconFriends size={64} className="mb-4 text-text-muted" />
          <h2 className="text-xl font-semibold">Select a friend to start chatting</h2>
          <p className="mt-2 max-w-sm text-sm text-text-muted">
            Add friends by username, accept pending requests, or create a server with the + button.
          </p>
        </main>
      )}

      {app.viewMode === "server" && activeChannel && isVoice && (
        <VoicePanel
          channelId={activeChannel.id}
          channelName={activeChannel.name}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}

      {app.viewMode === "server" && activeChannel && !isVoice && (
        <ChatCanvas
          ref={channelChatRef}
          channelName={activeChannel.name}
          messages={channelMessages}
          members={app.members.map((m) => m.profile)}
          roles={app.serverRoles}
          currentUserId={app.user?.id}
          currentUserName={app.profile ? displayName(app.profile) : undefined}
          messageContext="channel"
          reactions={app.messageReactions}
          typingScope={{ kind: "channel", id: activeChannel.id, serverId: activeChannel.server_id }}
          getAuthorColor={getAuthorColor}
          onSend={app.sendChannelMessage}
          onEdit={app.editChannelMessage}
          onToggleReaction={(id, emoji) => void app.toggleReaction("channel", id, emoji)}
          onMessageContext={(m, x, y) => handleMessageContext(m, x, y, "channel")}
          onAuthorClick={handleAuthorClick}
          hasMore={app.channelHasMore}
          onLoadMore={app.loadMoreChannelMessages}
        />
      )}

      {app.viewMode === "server" && (
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
        isFriend={profileFriend}
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
          profileTarget && profileFriend
            ? () => {
                void startVoiceCall(profileTarget);
                setProfileTarget(null);
              }
            : undefined
        }
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <CreateServerModal open={createServerOpen} onClose={() => setCreateServerOpen(false)} />
      <ServerSettingsModal open={serverSettingsOpen} onClose={() => setServerSettingsOpen(false)} />
      <InviteGroupModal
        open={inviteGroupOpen && !!inviteGroupId}
        groupId={inviteGroupId}
        members={app.groupChats.find((g) => g.id === inviteGroupId)?.members ?? []}
        onClose={() => {
          setInviteGroupOpen(false);
          setInviteGroupId(null);
        }}
      />
    </div>
  );
}

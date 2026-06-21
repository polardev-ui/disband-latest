"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useCallManager } from "@/hooks/useCallManager";
import { useContextMenu, type ContextMenuItem } from "@/components/ui/ContextMenu";
import { ServerList } from "./ServerList";
import { ChannelList } from "./ChannelList";
import { HomePanel } from "./HomePanel";
import { ChatCanvas } from "./ChatCanvas";
import { VoicePanel } from "./VoicePanel";
import { MemberList } from "./MemberList";
import { DmUnreadBadge } from "./DmUnreadBadge";
import { ActiveCallBanner, IncomingCallOverlay } from "./CallUI";
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
  IconPhone,
} from "@/components/icons";
import { displayName, getInviteUrl } from "@/lib/utils";
import type { Channel, Profile, Server } from "@/lib/supabase/types";
import type { ChatMessageData } from "./ChatMessage";

export function DiscordApp() {
  const app = useApp();
  const { openMenu } = useContextMenu();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createServerOpen, setCreateServerOpen] = useState(false);
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false);
  const [profileTarget, setProfileTarget] = useState<Profile | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const call = useCallManager(
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
      void el.play().catch(() => {});
    }
  }, [call.remoteStream, app.deafened]);

  const activeChannel = app.channels.find((c) => c.id === app.activeChannelId);
  const isVoice = activeChannel?.type === "voice";
  const dmFriend = app.dmThreads.find((t) => t.id === app.activeDmThreadId)?.friend;

  const canModerate =
    app.activeServer?.owner_id === app.user?.id ||
    app.members.find((m) => m.user_id === app.user?.id)?.role === "admin";

  const getAuthorColor = useCallback(
    (authorId: string) => {
      const member = app.members.find((m) => m.user_id === authorId);
      if (member) return app.getMemberColor(member) ?? member.profile.accent_color;
      return undefined;
    },
    [app],
  );

  const openProfile = useCallback((profile: Profile) => setProfileTarget(profile), []);

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

  const handleMessageContext = useCallback(
    (message: ChatMessageData, x: number, y: number, isDm = false) => {
      const isOwn = message.author_id === app.user?.id;
      openMenu(x, y, [
        {
          id: "copy",
          label: "Copy Text",
          icon: <IconCopy size={16} />,
          disabled: !message.content,
          onClick: () => void navigator.clipboard.writeText(message.content),
        },
        ...(isOwn
          ? [
              {
                id: "delete",
                label: "Delete Message",
                icon: <IconTrash size={16} />,
                danger: true,
                onClick: () =>
                  isDm ? void app.deleteDmMessage(message.id) : void app.deleteMessage(message.id),
              },
            ]
          : []),
      ]);
    },
    [app, openMenu],
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

  const channelMessages: ChatMessageData[] = app.messages.map((m) => ({
    id: m.id,
    author_id: m.author_id,
    content: m.content,
    attachment_url: m.attachment_url,
    attachment_type: m.attachment_type,
    created_at: m.created_at,
    author: m.author,
  }));

  const dmMessages: ChatMessageData[] = app.dmMessages.map((m) => ({
    id: m.id,
    author_id: m.author_id,
    content: m.content,
    attachment_url: m.attachment_url,
    attachment_type: m.attachment_type,
    created_at: m.created_at,
    author: m.author,
  }));

  const profileFriend = profileTarget ? app.friends.some((f) => f.id === profileTarget.id) : false;

  const callBannerPeer = call.activePeer ?? dmFriend;
  const showCallBanner =
    callBannerPeer && (call.phase === "outgoing" || call.phase === "active");

  const startVoiceCall = useCallback(
    (peer: Profile) => {
      void app.openDmWithFriend(peer.id);
      void call.startCall(peer);
    },
    [app, call],
  );

  return (
    <div className="relative flex h-screen w-screen overflow-hidden">
      {app.dmUnread && !(app.viewMode === "dm" && app.activeDmThreadId === app.dmUnread.threadId) && (
        <DmUnreadBadge
          friend={app.dmUnread.friend}
          count={app.dmUnread.count}
          onClick={() => void app.selectDmThread(app.dmUnread!.threadId)}
        />
      )}

      {call.phase === "incoming" && call.incoming && (
        <IncomingCallOverlay
          callerName={call.incoming.callerName}
          profile={call.incoming.profile}
          onAccept={() => void call.acceptCall()}
          onReject={() => void call.rejectCall()}
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
        onSelectHome={app.setViewHome}
        onSelectServer={(id) => void app.selectServer(id)}
        onCreateServer={() => setCreateServerOpen(true)}
        onServerContext={handleServerContext}
      />

      {app.viewMode === "home" || app.viewMode === "dm" ? (
        <HomePanel
          onOpenSettings={() => setSettingsOpen(true)}
          onUserPanelContext={handleUserPanelContext}
          onFriendClick={(id) => {
            const f = app.friends.find((x) => x.id === id);
            if (f) openProfile(f);
          }}
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
          channelName={displayName(dmFriend)}
          messages={dmMessages}
          members={[dmFriend, ...(app.profile ? [app.profile] : [])]}
          currentUserId={app.user?.id}
          headerExtra={
            showCallBanner && callBannerPeer ? (
              <ActiveCallBanner
                peer={callBannerPeer}
                phase={call.phase === "outgoing" ? "outgoing" : "active"}
                micMuted={app.micMuted}
                deafened={app.deafened}
                onToggleMic={() => app.setMicMuted(!app.micMuted)}
                onToggleDeafen={() => {
                  const next = !app.deafened;
                  app.setDeafened(next);
                  if (next) app.setMicMuted(true);
                }}
                onEnd={() => void call.endCall()}
                onOpenSettings={() => setSettingsOpen(true)}
              />
            ) : (
              <div className="flex gap-2 border-t border-black/10 px-4 py-1">
                <button
                  type="button"
                  disabled={call.phase !== "idle"}
                  onClick={() => void startVoiceCall(dmFriend)}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-status-online hover:bg-interactive-hover disabled:opacity-40"
                >
                  <IconPhone size={14} /> Start Voice Call
                </button>
              </div>
            )
          }
          onSend={app.sendDmMessage}
          onMessageContext={(m, x, y) => handleMessageContext(m, x, y, true)}
        />
      )}

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
          channelName={activeChannel.name}
          messages={channelMessages}
          members={app.members.map((m) => m.profile)}
          roles={app.serverRoles}
          currentUserId={app.user?.id}
          getAuthorColor={getAuthorColor}
          onSend={app.sendChannelMessage}
          onMessageContext={(m, x, y) => handleMessageContext(m, x, y, false)}
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
        onMessage={
          profileTarget
            ? () => {
                void app.openDmWithFriend(profileTarget.id);
                setProfileTarget(null);
              }
            : undefined
        }
        onAddFriend={
          profileTarget && !profileFriend && profileTarget.username
            ? () => {
                void app.sendFriendRequest(profileTarget.username!);
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
      />

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <CreateServerModal open={createServerOpen} onClose={() => setCreateServerOpen(false)} />
      <ServerSettingsModal open={serverSettingsOpen} onClose={() => setServerSettingsOpen(false)} />
    </div>
  );
}

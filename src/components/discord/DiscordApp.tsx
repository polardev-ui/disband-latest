"use client";

import { useCallback, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useContextMenu } from "@/components/ui/ContextMenu";
import { ServerList } from "./ServerList";
import { ChannelList } from "./ChannelList";
import { HomePanel } from "./HomePanel";
import { ChatCanvas } from "./ChatCanvas";
import { VoicePanel } from "./VoicePanel";
import { MemberList } from "./MemberList";
import { SettingsModal } from "./SettingsModal";
import { CreateServerModal } from "@/components/modals/CreateServerModal";
import { ServerSettingsModal } from "@/components/modals/ServerSettingsModal";
import {
  IconCopy,
  IconLeave,
  IconSettings,
  IconTrash,
  IconFriends,
} from "@/components/icons";
import { displayName } from "@/lib/utils";
import type { Channel, Server } from "@/lib/supabase/types";
import type { ChatMessageData } from "./ChatMessage";

export function DiscordApp() {
  const app = useApp();
  const { openMenu } = useContextMenu();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createServerOpen, setCreateServerOpen] = useState(false);
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false);

  const activeChannel = app.channels.find((c) => c.id === app.activeChannelId);
  const isVoice = activeChannel?.type === "voice";
  const dmFriend = app.dmThreads.find((t) => t.id === app.activeDmThreadId)?.friend;

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
      openMenu(x, y, [
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
      ]);
    },
    [app, openMenu],
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

  return (
    <div className="flex h-screen w-screen overflow-hidden">
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
        <HomePanel />
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
        />
      )}

      {/* User panel context — overlay on channel list bottom */}
      {(app.viewMode === "server") && (
        <div className="pointer-events-none fixed bottom-0 left-[72px] z-10 hidden w-60 md:block">
          <div className="pointer-events-auto h-[52px]" onContextMenu={handleUserPanelContext} />
        </div>
      )}

      {app.viewMode === "dm" && dmFriend && (
        <ChatCanvas
          channelName={displayName(dmFriend)}
          messages={dmMessages}
          members={[dmFriend, ...(app.profile ? [app.profile] : [])]}
          currentUserId={app.user?.id}
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
        <VoicePanel channelId={activeChannel.id} channelName={activeChannel.name} />
      )}

      {app.viewMode === "server" && activeChannel && !isVoice && (
        <ChatCanvas
          channelName={activeChannel.name}
          messages={channelMessages}
          members={app.members.map((m) => m.profile)}
          currentUserId={app.user?.id}
          onSend={app.sendChannelMessage}
          onMessageContext={(m, x, y) => handleMessageContext(m, x, y, false)}
        />
      )}

      {app.viewMode === "server" && <MemberList members={app.members} onMemberContext={handleMemberContext} />}

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <CreateServerModal open={createServerOpen} onClose={() => setCreateServerOpen(false)} />
      <ServerSettingsModal open={serverSettingsOpen} onClose={() => setServerSettingsOpen(false)} />
    </div>
  );
}

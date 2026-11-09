"use client";

/**
 * Development-only harness: the real signed-in app (`DiscordApp`) mounted
 * over sample data from ./mock.ts. Navigation, sending, reactions and status
 * work locally; everything else is a no-op. Nothing here reaches the backend.
 *
 * Query parameters pick the starting screen:
 *   ?view=home | space | dm | group | discover   (default: space)
 *   ?theme=dark | midnight | light               (default: stored theme)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { AppPreviewProvider, type AppContextValue } from "@/contexts/AppContext";
import { ContextMenuProvider } from "@/components/ui/ContextMenu";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { VoiceSessionProvider } from "@/contexts/VoiceSessionContext";
import { DiscordApp } from "@/components/discord/DiscordApp";
import type { MessageReaction } from "@/lib/messages";
import type { Message, Profile, ServerPermissionKey, UserStatus, ViewMode } from "@/lib/supabase/types";
import * as M from "./mock";

const noop = () => {};
const asyncVoid = async () => {};
const asyncNull = async () => null;

const ALL_PERMISSIONS: Record<ServerPermissionKey, boolean> = {
  administrator: true,
  kick: true,
  ban: true,
  manage_roles: true,
  manage_server: true,
  manage_channels: true,
  manage_messages: true,
  manage_emojis: true,
  manage_webhooks: true,
  mention_everyone: true,
  send_messages: true,
  add_reactions: true,
  attach_files: true,
  timeout_members: true,
  pin_messages: true,
  view_audit_log: true,
  create_invites: true,
};

export function PreviewApp() {
  const [viewMode, setViewMode] = useState<ViewMode>("space");
  const [activeServerId, setActiveServerId] = useState<string | null>(M.SERVERS[0].id);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(M.CHANNELS[0].id);
  const [activeDmThreadId, setActiveDmThreadId] = useState<string | null>(null);
  const [activeGroupChatId, setActiveGroupChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState(M.MESSAGES);
  const [dmMessages, setDmMessages] = useState(M.DM_MESSAGES);
  const [reactions, setReactions] = useState<MessageReaction[]>(M.MESSAGE_REACTIONS);
  const [profile, setProfile] = useState<Profile>(M.ME);
  const [micMuted, setMicMuted] = useState(true);
  const [deafened, setDeafened] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const view = params.get("view");
    if (view === "home" || view === "discover") setViewMode(view);
    if (view === "dm") {
      setViewMode("dm");
      setActiveDmThreadId(M.DM_THREADS[0].id);
    }
    if (view === "group") {
      setViewMode("group");
      setActiveGroupChatId(M.GROUPS[0].id);
    }
    const theme = params.get("theme");
    if (theme) document.documentElement.setAttribute("data-theme", theme);
  }, []);

  const user = useMemo(
    () => ({ id: M.ME.id, email: "preview@disband.invalid", app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: M.ME.created_at }) as unknown as User,
    [],
  );
  const session = useMemo(
    () => ({ access_token: "preview", refresh_token: "preview", expires_in: 3600, token_type: "bearer", user }) as unknown as Session,
    [user],
  );

  const presenceMap = useMemo(() => new Map<string, UserStatus>(M.PEOPLE.map((p) => [p.id, p.status])), []);

  const send = useCallback(async (content: string) => {
    const row: Message & { author: Profile } = {
      ...M.MESSAGES[0],
      id: crypto.randomUUID(),
      author_id: M.ME.id,
      author: profile,
      content,
      created_at: new Date().toISOString(),
      display_id: Date.now(),
      mentions: [],
    };
    setMessages((rows) => [...rows, row]);
    return null;
  }, [profile]);

  const sendDm = useCallback(async (content: string) => {
    setDmMessages((rows) => [
      ...rows,
      { ...M.DM_MESSAGES[0], id: crypto.randomUUID(), author_id: M.ME.id, author: profile, content, created_at: new Date().toISOString(), display_id: Date.now() },
    ]);
    return null;
  }, [profile]);

  const toggleReaction = useCallback(async (context: MessageReaction["context_type"], messageId: string, emoji: string) => {
    setReactions((rows) => {
      const mine = rows.find((r) => r.message_id === messageId && r.emoji === emoji && r.user_id === M.ME.id);
      if (mine) return rows.filter((r) => r !== mine);
      return [...rows, { id: crypto.randomUUID(), context_type: context, message_id: messageId, user_id: M.ME.id, emoji, created_at: new Date().toISOString() }];
    });
  }, []);

  const activeServer = M.SERVERS.find((s) => s.id === activeServerId) ?? null;
  const activeChannel = viewMode === "space" ? M.CHANNELS.find((c) => c.id === activeChannelId) ?? null : null;
  const visibleMessages = activeChannel?.id === M.CHANNELS[0].id ? messages : [];

  const value: AppContextValue = {
    ready: true,
    hydrated: true,
    configured: true,
    session,
    user,
    profile,
    tetherProfile: null,
    officialProfile: null,
    subscriptionPlan: "aero",
    servers: M.SERVERS,
    categories: viewMode === "space" && activeServerId === M.SERVERS[0].id ? M.CATEGORIES : [],
    channels: viewMode === "space" && activeServerId === M.SERVERS[0].id ? M.CHANNELS : [],
    members: M.MEMBERS,
    serverRoles: M.ROLES,
    messages: visibleMessages,
    dmThreads: M.DM_THREADS,
    dmMessages: activeDmThreadId === M.DM_THREADS[0].id ? dmMessages : [],
    notes: M.NOTES,
    groupChats: M.GROUPS,
    groupMessages: M.GROUP_MESSAGES,
    messagesLoading: false,
    dmLoading: false,
    groupLoading: false,
    membersLoading: false,
    membersHasMore: false,
    loadMoreMembers: asyncVoid,
    loadAllMembers: asyncVoid,
    friendships: M.FRIENDSHIPS,
    friends: M.FRIENDSHIPS.map((f) => f.addressee!),
    pendingIncoming: [],
    pendingOutgoing: [],
    notifications: [],
    voicePresence: M.VOICE_PRESENCE,
    viewMode,
    activeServerId: viewMode === "space" ? activeServerId : null,
    activeChannelId: viewMode === "space" ? activeChannelId : null,
    activeDmThreadId: viewMode === "dm" ? activeDmThreadId : null,
    activeGroupChatId: viewMode === "group" ? activeGroupChatId : null,
    activeChannel,
    activeServer: viewMode === "space" ? activeServer : null,
    micMuted,
    deafened,
    setMicMuted,
    setDeafened,
    signIn: asyncNull,
    signUp: async () => ({ error: null }) as never,
    requestPasswordReset: asyncNull,
    updatePassword: asyncNull,
    requestAccountDeletion: async () => ({ ok: true }),
    cancelAccountDeletion: async () => ({ ok: true }),
    mfaRequired: false,
    refreshMfaStatus: asyncVoid,
    signOut: asyncVoid,
    refreshAll: asyncVoid,
    refreshProfile: asyncVoid,
    savedSessions: [],
    switchAccount: asyncNull,
    removeSavedAccount: noop,
    registerAnonymousAccount: async () => ({ ok: false }) as never,
    adoptAnonymousSession: asyncNull,
    loginAnonymousAccount: async () => ({ ok: false }) as never,
    exportAnonymousData: async () => ({ ok: false }) as never,
    purgeAnonymousAccount: async () => ({ ok: false }) as never,
    addingAccount: false,
    beginAddAccount: noop,
    cancelAddAccount: noop,
    addAccountPrefill: null,
    updateProfile: async (patch) => {
      setProfile((p) => ({ ...p, ...patch }));
      return null;
    },
    setViewHome: () => setViewMode("home"),
    setViewDiscover: () => setViewMode("discover"),
    setViewNotes: async () => setViewMode("notes"),
    selectServer: async (id) => {
      setViewMode("space");
      setActiveServerId(id);
      if (id === M.SERVERS[0].id) setActiveChannelId(M.CHANNELS[0].id);
    },
    selectChannel: (id) => setActiveChannelId(id),
    selectDmThread: async (id) => {
      setViewMode("dm");
      setActiveDmThreadId(id);
    },
    selectGroupChat: async (id) => {
      setViewMode("group");
      setActiveGroupChatId(id);
    },
    refreshGroupChats: asyncVoid,
    createGroupChat: asyncNull,
    leaveGroupChat: asyncNull,
    inviteToGroup: asyncNull,
    renameGroupChat: asyncNull,
    deleteGroupMessage: asyncVoid,
    groupCallCounts: new Map(),
    openDmWithFriend: async (friendId) => {
      const thread = M.DM_THREADS.find((t) => t.friend.id === friendId);
      if (thread) {
        setViewMode("dm");
        setActiveDmThreadId(thread.id);
      }
      return null;
    },
    messageRequests: [],
    isIncomingRequest: () => false,
    isOutgoingRequest: () => false,
    respondMessageRequest: asyncNull,
    sendInviteToFriend: asyncNull,
    sendFriendRequest: asyncNull,
    respondFriendRequest: asyncVoid,
    removeFriend: asyncVoid,
    blockUser: asyncNull,
    unblockUser: asyncNull,
    blockedUserIds: new Set(),
    isBlocked: () => false,
    isBlockedEitherWay: () => false,
    createServer: asyncNull,
    updateServer: asyncNull,
    deleteServer: asyncNull,
    leaveServer: asyncNull,
    joinServerByInvite: asyncNull,
    joinServerById: asyncNull,
    kickMember: asyncNull,
    transferOwnership: asyncNull,
    banMember: asyncNull,
    unbanMember: asyncNull,
    timeoutMember: asyncNull,
    removeMemberTimeout: asyncNull,
    removeGroupMember: asyncNull,
    loadMutuals: async () => ({ serverIds: [M.SERVERS[0].id], friendIds: [M.DARLENE.id] }),
    serverTimeouts: [],
    rosterVersion: 0,
    serverBans: [],
    serverFolders: [],
    serverListState: [],
    loadServerOrganization: asyncVoid,
    createFolder: asyncNull,
    renameFolder: asyncNull,
    setFolderColor: asyncNull,
    deleteFolder: asyncNull,
    reorderFolders: asyncNull,
    setServerSlot: asyncNull,
    reorderServers: asyncNull,
    createRole: asyncNull,
    setMemberRoles: asyncNull,
    setSelfRoles: asyncNull,
    myTopRolePosition: 99,
    canModerateMember: () => true,
    getMemberColor: (member) => M.ROLES.find((r) => r.id === member.role_id && !r.is_default)?.color ?? null,
    getMemberIconRole: () => null,
    createChannel: asyncNull,
    renameChannel: asyncNull,
    setChannelReadOnly: asyncNull,
    deleteChannel: asyncNull,
    createCategory: asyncNull,
    renameCategory: asyncNull,
    deleteCategory: asyncNull,
    moveChannel: asyncNull,
    moveCategory: asyncNull,
    deleteRole: asyncNull,
    moveRole: asyncNull,
    sendChannelMessage: send,
    sendDmMessage: sendDm,
    sendGroupMessage: asyncNull,
    editChannelMessage: async (id, content) => {
      setMessages((rows) => rows.map((r) => (r.id === id ? { ...r, content, edited_at: new Date().toISOString() } : r)));
      return null;
    },
    editDmMessage: asyncNull,
    editGroupMessage: asyncNull,
    toggleReaction,
    messageReactions: reactions,
    deleteMessage: async (id) => setMessages((rows) => rows.filter((r) => r.id !== id)),
    deleteDmMessage: async (id) => setDmMessages((rows) => rows.filter((r) => r.id !== id)),
    sendNote: asyncNull,
    editNote: asyncNull,
    deleteNote: asyncVoid,
    toggleNotePinned: asyncVoid,
    pinnedBySource: {},
    loadPinnedMessages: asyncVoid,
    pinMessage: asyncVoid,
    unpinMessage: asyncVoid,
    markNotificationsRead: asyncVoid,
    catalystCounts: { [M.SERVERS[0].id]: 3 },
    myCatalysts: [],
    refreshCatalysts: asyncVoid,
    transferCatalyst: asyncNull,
    allocateCatalyst: asyncNull,
    withdrawCatalyst: asyncNull,
    customEmojiMap: {},
    markNotificationsSeen: asyncVoid,
    markNotificationRead: asyncVoid,
    routeToNotification: async () => false,
    loadVoicePresence: asyncVoid,
    voiceJoinedChannelId: null,
    setVoiceJoinedChannelId: noop,
    setCallPhase: noop,
    setMaxMessageChars: noop,
    setMaxBioLength: noop,
    dmUnreads: [{ threadId: M.DM_THREADS[1].id, friend: M.ANGELA, count: 2 }],
    dmListEntries: M.DM_THREADS.map((t, i) => ({
      key: t.id,
      friend: t.friend,
      threadId: t.id,
      unreadCount: i === 1 ? 2 : 0,
      sortAt: t.created_at,
    })),
    serverUnreadIds: [M.SERVERS[1].id],
    getDmUnreadCount: (id) => (id === M.DM_THREADS[1].id ? 2 : 0),
    clearDmUnread: noop,
    closeDmThread: noop,
    unhideDmFriend: noop,
    channelUnreadMap: new Map([[M.CHANNELS[2].id, 4]]),
    markServerRead: asyncVoid,
    getChannelUnreadCount: (id) => (id === M.CHANNELS[2].id ? 4 : 0),
    getChannelMentionCount: (id) => (id === M.CHANNELS[3].id ? 1 : 0),
    serverMentionCounts: new Map([[M.SERVERS[2].id, 2]]),
    getServerMentionCount: (id) => (id === M.SERVERS[2].id ? 2 : 0),
    groupUnreadMap: new Map(),
    getGroupUnreadCount: () => 0,
    clearGroupUnread: noop,
    presenceMap,
    listeningMap: new Map(),
    activityMap: new Map(),
    setGameActivity: noop,
    channelHasMore: false,
    dmHasMore: false,
    groupHasMore: false,
    notesHasMore: false,
    loadMoreChannelMessages: asyncVoid,
    loadChannelContextWindow: async () => false,
    loadDmContextWindow: async () => false,
    loadGroupContextWindow: async () => false,
    loadMoreDmMessages: asyncVoid,
    loadMoreGroupMessages: asyncVoid,
    loadMoreNotes: asyncVoid,
    platformBan: null,
    restrictions: [],
    refreshRestrictions: asyncVoid,
    refreshPlatformAccess: asyncVoid,
    serverPermissions: ALL_PERMISSIONS,
    hasServerPermission: () => true,
    channelEffects: {},
    updateRole: asyncNull,
    platformBanUser: asyncNull,
    platformUnbanUser: asyncNull,
  };

  return (
    <ThemeProvider>
      <AppPreviewProvider value={value}>
        <ContextMenuProvider>
          <div className="flex h-screen flex-col">
            <div className="min-h-0 flex-1">
              <VoiceSessionProvider>
                <DiscordApp />
              </VoiceSessionProvider>
            </div>
          </div>
        </ContextMenuProvider>
      </AppPreviewProvider>
    </ThemeProvider>
  );
}

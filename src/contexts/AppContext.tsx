"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient, isAccessTokenExpired, isSupabaseConfigured, refreshSessionOnce, resetSupabaseClient } from "@/lib/supabase/client";
import { getSavedSessions, getSavedSessionTokens, clearSavedSessionTokens, saveSession as persistSavedSession, removeSavedSession as dropSavedSession, type SavedSession } from "@/lib/saved-sessions";
import { isTauri } from "@/lib/platform";
import { notifyUser, alertIncomingDm, alertMention, setNotificationFocusState, parseNotificationLink, primeNotificationPermission } from "@/lib/notifications";
import { requestUnreadJump } from "@/lib/notification-jump";
import { syncUserSettings } from "@/lib/user-settings";
import { getAuthRedirectUrl } from "@/lib/auth-redirect";
import { preloadImages } from "@/lib/preload-images";
import { mapProfileError, mapGroupChatError, mapMessageError } from "@/lib/profileErrors";
import { messageCharLimitError, bioLengthError } from "@/lib/word-limit";
import { getMfaAssurance } from "@/lib/mfa";
import { mapAuthError, type SignUpResult } from "@/lib/authErrors";
import { uploadMedia } from "@/lib/media/uploadMedia";
import { getLastChannelId, setLastChannelId } from "@/lib/server-last-channel";
import { getCached, setCache } from "@/lib/app-cache";
import { refreshOwnBadges } from "@/lib/badge-store";
import { parseMentions, normalizeMessageContent, displayName } from "@/lib/utils";
import {
  AWAY_AFTER_MS,
  flattenPresenceState,
  PRESENCE_CHANNEL,
  type PresenceMap,
  type PresencePayload,
} from "@/lib/presence";
import {
  matchesOptimisticRow,
  type MessageContext,
  type MessageReaction,
  type MessageSendOptions,
} from "@/lib/messages";
import {
  MESSAGE_PAGE_SIZE,
  loadReactionsForMessages,
  mergeReactions,
  paginateDescendingRows,
  replaceReactionsForContext,
  trimToLatestWindow,
} from "@/lib/message-pagination";
import { apiFetch } from "@/lib/api";
import { checkMentionSend } from "@/lib/mention-guard";
import {
  MAX_ATTACHMENTS,
  attachmentKind,
  legacyColumns,
  uploadAttachments,
  type StoredAttachment,
} from "@/lib/message-attachments";
import { useSubscription } from "@/hooks/useSubscription";
import type { SubscriptionPlan } from "@/lib/subscription";
import { askTether, fetchTetherInfo, mentionsTether, type TetherSurface } from "@/lib/tether-client";
import { clearAppBadge, setAppBadge } from "@/lib/app-badge";
import { fetchProfilesByIds } from "@/lib/fetch-profiles";
import type {
  AppNotification,
  Channel,
  ChannelCategory,
  ChannelEffects,
  DmMessage,
  DmThread,
  Friendship,
  GroupChatWithMembers,
  GroupMessage,
  Message,
  Note,
  Profile,
  Server,
  ServerBan,
  ServerFolder,
  ServerListState,
  ServerMember,
  ServerPermissionKey,
  ServerRole,
  ServerTimeout,
  UserStatus,
  ViewMode,
  VoicePresence,
  ChannelType,
  PinnedMessage,
  PinnedSourceType,
} from "@/lib/supabase/types";

interface AppContextValue {
  ready: boolean;

  hydrated: boolean;
  configured: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  tetherProfile: Profile | null;
  subscriptionPlan: SubscriptionPlan;
  servers: Server[];
  categories: ChannelCategory[];
  channels: Channel[];
  members: (ServerMember & { profile: Profile })[];
  serverRoles: ServerRole[];
  messages: (Message & { author: Profile })[];
  dmThreads: (DmThread & { friend: Profile })[];
  dmMessages: (DmMessage & { author: Profile })[];
  notes: Note[];
  groupChats: GroupChatWithMembers[];
  groupMessages: (GroupMessage & { author?: Profile | null })[];
  messagesLoading: boolean;
  dmLoading: boolean;
  groupLoading: boolean;
  friendships: Friendship[];
  friends: Profile[];
  pendingIncoming: Friendship[];
  pendingOutgoing: Friendship[];
  notifications: AppNotification[];
  voicePresence: (VoicePresence & { profile: Profile })[];
  viewMode: ViewMode;
  activeServerId: string | null;
  activeChannelId: string | null;
  activeDmThreadId: string | null;
  activeGroupChatId: string | null;
  activeChannel: Channel | null;
  activeServer: Server | null;
  micMuted: boolean;
  deafened: boolean;
  setMicMuted: (v: boolean) => void;
  setDeafened: (v: boolean) => void;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string, username: string, referralCode?: string | null, turnstileToken?: string | null) => Promise<SignUpResult>;
  requestPasswordReset: (email: string) => Promise<string | null>;
  updatePassword: (password: string) => Promise<string | null>;
  mfaRequired: boolean;
  refreshMfaStatus: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshAll: () => Promise<void>;
  savedSessions: SavedSession[];
  switchAccount: (account: SavedSession) => Promise<string | null>;
  removeSavedAccount: (userId: string) => void;

  addingAccount: boolean;
  beginAddAccount: () => void;
  cancelAddAccount: () => void;
  updateProfile: (patch: Partial<Profile>) => Promise<string | null>;
  setViewHome: () => void;
  setViewDiscover: () => void;
  setViewNotes: () => Promise<void>;
  selectServer: (serverId: string) => Promise<void>;
  selectChannel: (channelId: string) => void;
  selectDmThread: (threadId: string) => Promise<void>;
  selectGroupChat: (groupId: string) => Promise<void>;
  refreshGroupChats: () => Promise<void>;
  createGroupChat: (name: string, memberIds: string[]) => Promise<string | null>;
  leaveGroupChat: (groupId: string) => Promise<string | null>;
  inviteToGroup: (groupId: string, memberIds: string[]) => Promise<string | null>;
  renameGroupChat: (groupId: string, name: string) => Promise<string | null>;
  deleteGroupMessage: (messageId: string) => Promise<void>;
  groupCallCounts: Map<string, number>;
  openDmWithFriend: (friendId: string) => Promise<void>;
  sendInviteToFriend: (friendId: string, inviteUrl: string, serverName: string) => Promise<string | null>;
  sendFriendRequest: (username: string) => Promise<string | null>;
  respondFriendRequest: (id: string, accept: boolean) => Promise<void>;
  removeFriend: (friendId: string) => Promise<void>;
  blockUser: (userId: string) => Promise<string | null>;
  unblockUser: (userId: string) => Promise<string | null>;
  blockedUserIds: Set<string>;
  isBlocked: (userId: string) => boolean;
  isBlockedEitherWay: (userId: string) => boolean;
  createServer: (data: { name: string; iconUrl?: string; bannerUrl?: string; description?: string }) => Promise<string | null>;
  updateServer: (serverId: string, patch: Partial<Server>) => Promise<string | null>;
  deleteServer: (serverId: string) => Promise<string | null>;
  leaveServer: (serverId: string) => Promise<string | null>;
  joinServerByInvite: (code: string) => Promise<string | null>;
  joinServerById: (serverId: string) => Promise<string | null>;
  kickMember: (userId: string) => Promise<string | null>;
  banMember: (userId: string, reason?: string) => Promise<string | null>;
  unbanMember: (userId: string) => Promise<string | null>;
  timeoutMember: (userId: string, seconds: number, reason?: string) => Promise<string | null>;
  removeMemberTimeout: (userId: string) => Promise<string | null>;
  removeGroupMember: (groupId: string, userId: string) => Promise<string | null>;
  loadMutuals: (userId: string) => Promise<{ serverIds: string[]; friendIds: string[] }>;
  serverTimeouts: ServerTimeout[];
  serverBans: ServerBan[];
  serverFolders: ServerFolder[];
  serverListState: ServerListState[];
  loadServerOrganization: () => Promise<void>;
  createFolder: (name: string, color: string) => Promise<string | null>;
  renameFolder: (folderId: string, name: string) => Promise<string | null>;
  setFolderColor: (folderId: string, color: string) => Promise<string | null>;
  deleteFolder: (folderId: string) => Promise<string | null>;
  reorderFolders: (orderedIds: string[]) => Promise<string | null>;
  setServerSlot: (serverId: string, position: number, folderId: string | null) => Promise<string | null>;
  reorderServers: (slots: { server_id: string; position: number; folder_id: string | null }[]) => Promise<string | null>;
  createRole: (data: { name: string; color: string; permissions?: ServerRole["permissions"] }) => Promise<string | null>;
  setMemberRoles: (userId: string, roleIds: string[]) => Promise<string | null>;
  getMemberColor: (member: ServerMember) => string | null;
  createChannel: (data: { name: string; type?: ChannelType; categoryId?: string | null }) => Promise<string | null>;
  renameChannel: (channelId: string, name: string) => Promise<string | null>;
  setChannelReadOnly: (channelId: string, readOnly: boolean) => Promise<string | null>;
  deleteChannel: (channelId: string) => Promise<string | null>;
  createCategory: (name: string) => Promise<string | null>;
  renameCategory: (categoryId: string, name: string) => Promise<string | null>;
  deleteCategory: (categoryId: string) => Promise<string | null>;
  moveChannel: (channelId: string, categoryId: string | null, index: number) => Promise<string | null>;
  moveCategory: (categoryId: string, index: number) => Promise<string | null>;
  deleteRole: (roleId: string) => Promise<string | null>;
  moveRole: (roleId: string, position: number) => Promise<string | null>;
  sendChannelMessage: (content: string, options?: MessageSendOptions) => Promise<string | null>;
  sendDmMessage: (content: string, options?: MessageSendOptions) => Promise<string | null>;
  sendGroupMessage: (content: string, options?: MessageSendOptions) => Promise<string | null>;
  editChannelMessage: (messageId: string, content: string) => Promise<string | null>;
  editDmMessage: (messageId: string, content: string) => Promise<string | null>;
  editGroupMessage: (messageId: string, content: string) => Promise<string | null>;
  toggleReaction: (context: MessageContext, messageId: string, emoji: string) => Promise<void>;
  messageReactions: MessageReaction[];
  deleteMessage: (messageId: string) => Promise<void>;
  deleteDmMessage: (messageId: string) => Promise<void>;
  sendNote: (content: string, options?: MessageSendOptions) => Promise<string | null>;
  editNote: (noteId: string, content: string) => Promise<string | null>;
  deleteNote: (noteId: string) => Promise<void>;
  toggleNotePinned: (noteId: string) => Promise<void>;
  pinnedBySource: Record<string, PinnedMessage[]>;
  loadPinnedMessages: (sourceType: PinnedSourceType, sourceId: string) => Promise<void>;
  pinMessage: (
    sourceType: PinnedSourceType,
    sourceId: string,
    message: { id: string; author_id: string | null; content: string },
  ) => Promise<void>;
  unpinMessage: (sourceType: PinnedSourceType, sourceId: string, messageId: string) => Promise<void>;
  markNotificationsRead: () => Promise<void>;

  catalystCounts: Record<string, number>;

  myCatalysts: { server_id: string; created_at: string }[];
  refreshCatalysts: (serverIds: string[], uid: string) => Promise<void>;

  allocateCatalyst: (serverId: string) => Promise<string | null>;

  withdrawCatalyst: (serverId: string) => Promise<string | null>;

  customEmojiMap: Record<string, string>;

  markNotificationsSeen: () => Promise<void>;

  markNotificationRead: (id: string) => Promise<void>;

  routeToNotification: (link: string | null, at?: string | null) => Promise<boolean>;
  loadVoicePresence: (channelId: string) => Promise<void>;
  voiceJoinedChannelId: string | null;
  setVoiceJoinedChannelId: (channelId: string | null) => void;
  setCallPhase: (phase: "idle" | "outgoing" | "incoming" | "active") => void;
  setMaxMessageChars: (n: number) => void;
  setMaxBioLength: (n: number) => void;
  dmUnreads: { threadId: string; friend: Profile; count: number }[];
  dmListEntries: {
    key: string;
    friend: Profile;
    threadId: string | null;
    unreadCount: number;
    sortAt: string;
  }[];
  serverUnreadIds: string[];
  getDmUnreadCount: (threadId: string) => number;
  clearDmUnread: (threadId: string) => void;
  channelUnreadMap: Map<string, number>;
  getChannelUnreadCount: (channelId: string) => number;
  getChannelMentionCount: (channelId: string) => number;
  groupUnreadMap: Map<string, number>;
  getGroupUnreadCount: (groupId: string) => number;
  clearGroupUnread: (groupId: string) => void;
  presenceMap: PresenceMap;
  channelHasMore: boolean;
  dmHasMore: boolean;
  groupHasMore: boolean;
  notesHasMore: boolean;
  loadMoreChannelMessages: () => Promise<void>;
  loadMoreDmMessages: () => Promise<void>;
  loadMoreGroupMessages: () => Promise<void>;
  loadMoreNotes: () => Promise<void>;
  platformBan: { banned: boolean; reason?: string; vpnBlocked?: boolean } | null;
  restrictions: string[];
  refreshRestrictions: () => Promise<void>;
  refreshPlatformAccess: () => Promise<void>;
  serverPermissions: Record<ServerPermissionKey, boolean>;
  hasServerPermission: (permission: ServerPermissionKey) => boolean;
  channelEffects: Record<string, ChannelEffects>;
  updateRole: (
    roleId: string,
    patch: Partial<Pick<ServerRole, "name" | "color" | "permissions" | "gradient_to" | "gradient_animated">>,
  ) => Promise<string | null>;
  platformBanUser: (opts: { username?: string; userId?: string; password: string; reason?: string }) => Promise<string | null>;
  platformUnbanUser: (opts: { userId: string; password: string }) => Promise<string | null>;
}

const AppContext = createContext<AppContextValue | null>(null);

function uploadErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Upload failed. Check your connection and try again.";
}

export function AppProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [ready, setReady] = useState(false);

  const [hydrated, setHydrated] = useState(false);

  const [dataLoaded, setDataLoaded] = useState(false);
  const imagesWarmedRef = useRef(false);
  const [session, setSession] = useState<Session | null>(null);
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>(() => getSavedSessions());
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tetherProfile, setTetherProfile] = useState<Profile | null>(null);
  const [servers, setServers] = useState<Server[]>([]);

  const [catalystCounts, setCatalystCounts] = useState<Record<string, number>>({});
  const [myCatalysts, setMyCatalysts] = useState<{ server_id: string; created_at: string }[]>([]);
  const [categories, setCategories] = useState<ChannelCategory[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [members, setMembers] = useState<(ServerMember & { profile: Profile })[]>([]);
  const [serverRoles, setServerRoles] = useState<ServerRole[]>([]);
  const [messages, setMessages] = useState<(Message & { author: Profile })[]>([]);
  const [dmThreads, setDmThreads] = useState<(DmThread & { friend: Profile })[]>([]);
  const [dmMessages, setDmMessages] = useState<(DmMessage & { author: Profile })[]>([]);
  const [groupChats, setGroupChats] = useState<GroupChatWithMembers[]>([]);
  const [groupCallCounts, setGroupCallCounts] = useState<Map<string, number>>(new Map());
  const [groupMessages, setGroupMessages] = useState<(GroupMessage & { author?: Profile | null })[]>([]);
  const [channelHasMore, setChannelHasMore] = useState(false);
  const [dmHasMore, setDmHasMore] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [notesHasMore, setNotesHasMore] = useState(false);
  const [groupHasMore, setGroupHasMore] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [dmLoading, setDmLoading] = useState(false);
  const [groupLoading, setGroupLoading] = useState(false);
  const [platformBan, setPlatformBan] = useState<{ banned: boolean; reason?: string; vpnBlocked?: boolean } | null>(null);
  const [restrictions, setRestrictions] = useState<string[]>([]);
  const [serverPermissions, setServerPermissions] = useState<Record<ServerPermissionKey, boolean>>({
    kick: false,
    ban: false,
    manage_roles: false,
    manage_server: false,
    manage_channels: false,
    manage_messages: false,
    manage_emojis: false,
    mention_everyone: false,
    send_messages: false,
    add_reactions: false,
    attach_files: false,
    timeout_members: false,
    pin_messages: false,
    view_audit_log: false,
    create_invites: false,
  });
  const [channelEffects, setChannelEffects] = useState<Record<string, ChannelEffects>>({});
  const [serverTimeouts, setServerTimeouts] = useState<ServerTimeout[]>([]);
  const [serverBans, setServerBans] = useState<ServerBan[]>([]);
  const [serverFolders, setServerFolders] = useState<ServerFolder[]>([]);
  const [serverListState, setServerListState] = useState<ServerListState[]>([]);
  const [messageReactions, setMessageReactions] = useState<MessageReaction[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [customEmojiMap, setCustomEmojiMap] = useState<Record<string, string>>({});
  const [voicePresence, setVoicePresence] = useState<(VoicePresence & { profile: Profile })[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("home");
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [activeDmThreadId, setActiveDmThreadId] = useState<string | null>(null);
  const [pinnedBySource, setPinnedBySource] = useState<Record<string, PinnedMessage[]>>({});
  const [activeGroupChatId, setActiveGroupChatId] = useState<string | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [voiceJoinedChannelId, setVoiceJoinedChannelId] = useState<string | null>(null);
  const [callPhase, setCallPhase] = useState<"idle" | "outgoing" | "incoming" | "active">("idle");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [dmUnreadMap, setDmUnreadMap] = useState<
    Map<string, { friend: Profile; count: number; latestAt: string }>
  >(new Map());
  const [dmThreadActivity, setDmThreadActivity] = useState<Record<string, string>>({});
  const [serverIndicators, setServerIndicators] = useState<Set<string>>(new Set());
  const [channelUnreadMap, setChannelUnreadMap] = useState<Map<string, number>>(new Map());

  const [channelMentionMap, setChannelMentionMap] = useState<Map<string, number>>(new Map());
  const [groupUnreadMap, setGroupUnreadMap] = useState<Map<string, number>>(new Map());
  const [presenceMap, setPresenceMap] = useState<PresenceMap>(new Map());

  const sessionRef = useRef<Session | null>(null);
  const activeDmRef = useRef<string | null>(null);
  const activeChannelRef = useRef<string | null>(null);
  const activeServerRef = useRef<string | null>(null);
  const activeGroupRef = useRef<string | null>(null);

  const dmOpenTokenRef = useRef(0);
  const channelsRef = useRef<Channel[]>([]);
  const serversRef = useRef<Server[]>([]);
  const dmThreadsRef = useRef<(DmThread & { friend: Profile })[]>([]);
  const groupChatsRef = useRef<GroupChatWithMembers[]>([]);
  const viewModeRef = useRef<ViewMode>("home");
  const profileRef = useRef<Profile | null>(null);
  const preferredStatusRef = useRef<UserStatus>("online");
  const maxMessageCharsRef = useRef(2000);
  const maxBioLengthRef = useRef(190);
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);
  const lastActivityRef = useRef<number>(typeof window !== "undefined" ? Date.now() : 0);
  const autoAwayRef = useRef(false);
  const inCallRef = useRef(false);
  const signingOutRef = useRef(false);
  sessionRef.current = session;
  profileRef.current = profile;
  syncUserSettings(profile);

  const rememberSession = useCallback((s: Session | null | undefined, p?: Profile | null) => {
    persistSavedSession(s, p);
    setSavedSessions(getSavedSessions());
  }, []);

  const removeSavedAccount = useCallback((userId: string) => {
    dropSavedSession(userId);
    setSavedSessions(getSavedSessions());
  }, []);

  const [addingAccount, setAddingAccount] = useState(false);
  const beginAddAccount = useCallback(() => setAddingAccount(true), []);
  const cancelAddAccount = useCallback(() => setAddingAccount(false), []);

  useEffect(() => {
    if (session && profile) rememberSession(session, profile);
  }, [session, profile, rememberSession]);

  useEffect(() => {
    setAddingAccount(false);
  }, [session?.user?.id]);
  channelsRef.current = channels;
  serversRef.current = servers;
  dmThreadsRef.current = dmThreads;
  groupChatsRef.current = groupChats;
  useEffect(() => { activeDmRef.current = activeDmThreadId; }, [activeDmThreadId]);
  useEffect(() => { activeChannelRef.current = activeChannelId; }, [activeChannelId]);
  useEffect(() => { activeServerRef.current = activeServerId; }, [activeServerId]);
  useEffect(() => { activeGroupRef.current = activeGroupChatId; }, [activeGroupChatId]);
  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);

  useEffect(() => {
    setNotificationFocusState({
      viewMode,
      activeServerId,
      activeChannelId,
      activeDmThreadId,
      activeGroupChatId,
      voiceJoinedChannelId,
      callPhase,
    });
  }, [
    viewMode,
    activeServerId,
    activeChannelId,
    activeDmThreadId,
    activeGroupChatId,
    voiceJoinedChannelId,
    callPhase,
  ]);

  const user = session?.user ?? null;
  const userId = user?.id ?? null;

  // The authoritative plan source (subscriptions table). Tether is Aero-gated;
  // we mirror it here so sending can decide to fire the ask without burning a
  // server call for non-Aero users. The route stays authoritative regardless.
  const { plan: subscriptionPlan } = useSubscription(userId ?? undefined);

  const activeServer = servers.find((s) => s.id === activeServerId) ?? null;
  const activeChannel = channels.find((c) => c.id === activeChannelId) ?? null;

  const friends = useMemo(() => {
    if (!userId) return [] as Profile[];
    const seen = new Set<string>();
    const list: Profile[] = [];
    for (const f of friendships) {
      if (f.status !== "accepted") continue;
      const p = f.requester_id === userId ? f.addressee : f.requester;
      if (p && !seen.has(p.id)) {
        seen.add(p.id);
        list.push(p);
      }
    }
    return list;
  }, [friendships, userId]);

  const pendingIncoming = useMemo(
    () => friendships.filter((f) => f.status === "pending" && f.addressee_id === userId),
    [friendships, userId],
  );
  const pendingOutgoing = useMemo(
    () => friendships.filter((f) => f.status === "pending" && f.requester_id === userId),
    [friendships, userId],
  );

  const blockedUserIds = useMemo(() => {
    if (!userId) return new Set<string>();
    return new Set(
      friendships
        .filter((f) => f.status === "blocked" && f.requester_id === userId)
        .map((f) => f.addressee_id),
    );
  }, [friendships, userId]);

  const blockRelatedIds = useMemo(() => {
    if (!userId) return new Set<string>();
    const ids = new Set<string>();
    for (const f of friendships) {
      if (f.status !== "blocked") continue;
      if (f.requester_id === userId) ids.add(f.addressee_id);
      if (f.addressee_id === userId) ids.add(f.requester_id);
    }
    return ids;
  }, [friendships, userId]);

  const isBlocked = useCallback((id: string) => blockedUserIds.has(id), [blockedUserIds]);
  const isBlockedEitherWay = useCallback((id: string) => blockRelatedIds.has(id), [blockRelatedIds]);

  const dmUnreads = useMemo((): { threadId: string; friend: Profile; count: number }[] => {
    return [...dmUnreadMap.entries()]
      .filter(([, entry]) => entry.count > 0)
      .sort((a, b) => b[1].latestAt.localeCompare(a[1].latestAt))
      .map(([threadId, entry]) => ({
        threadId,
        friend: entry.friend,
        count: entry.count,
      }));
  }, [dmUnreadMap]);

  const getDmUnreadCount = useCallback(
    (threadId: string) => dmUnreadMap.get(threadId)?.count ?? 0,
    [dmUnreadMap],
  );

  const sortedDmThreads = useMemo(() => {
    return [...dmThreads]
      .filter((t) => !blockRelatedIds.has(t.friend.id))
      .sort((a, b) => {
        const ta = dmThreadActivity[a.id] ?? a.created_at;
        const tb = dmThreadActivity[b.id] ?? b.created_at;
        return tb.localeCompare(ta);
      });
  }, [dmThreads, dmThreadActivity, blockRelatedIds]);

  const dmListEntries = useMemo(() => {
    const threadByFriend = new Map(sortedDmThreads.map((t) => [t.friend.id, t]));
    const entries: {
      key: string;
      friend: Profile;
      threadId: string | null;
      unreadCount: number;
      sortAt: string;
    }[] = [];

    for (const thread of sortedDmThreads) {
      entries.push({
        key: thread.id,
        friend: thread.friend,
        threadId: thread.id,
        unreadCount: dmUnreadMap.get(thread.id)?.count ?? 0,
        sortAt: dmThreadActivity[thread.id] ?? thread.created_at,
      });
    }

    for (const friend of friends) {
      if (threadByFriend.has(friend.id)) continue;
      entries.push({
        key: `friend-${friend.id}`,
        friend,
        threadId: null,
        unreadCount: 0,
        sortAt: dmThreadActivity[`friend:${friend.id}`] ?? friend.created_at,
      });
    }

    return entries.sort((a, b) => b.sortAt.localeCompare(a.sortAt));
  }, [sortedDmThreads, friends, dmUnreadMap, dmThreadActivity]);

  const serverUnreadIds = useMemo(() => [...serverIndicators], [serverIndicators]);

  const clearServerIndicator = useCallback((serverId: string) => {
    setServerIndicators((prev) => {
      if (!prev.has(serverId)) return prev;
      const next = new Set(prev);
      next.delete(serverId);
      return next;
    });
  }, []);

  const markDmReadNow = useCallback(async (threadId: string) => {
    const { error } = await getSupabaseClient().rpc("mark_dm_read", { p_thread_id: threadId });
    if (error) console.error("mark_dm_read failed", error.message);
  }, []);

  const clearDmUnread = useCallback((threadId: string) => {
    setDmUnreadMap((prev) => {
      if (!prev.has(threadId)) return prev;
      const next = new Map(prev);
      next.delete(threadId);
      return next;
    });
  }, []);

  const getGroupUnreadCount = useCallback(
    (groupId: string) => groupUnreadMap.get(groupId) ?? 0,
    [groupUnreadMap],
  );

  const clearGroupUnread = useCallback((groupId: string) => {
    setGroupUnreadMap((prev) => {
      if (!prev.has(groupId)) return prev;
      const next = new Map(prev);
      next.delete(groupId);
      return next;
    });
  }, []);

  const seedUnread = useCallback(async (uid: string) => {
    const supabase = getSupabaseClient();
    const threadByFriend = new Map(dmThreads.map((t) => [t.friend.id, t]));

    const [{ data: dm }, { data: grp }] = await Promise.all([
      supabase.rpc("get_dm_unread"),
      supabase.rpc("get_group_unread"),
    ]);

    setDmUnreadMap((prev) => {
      const next = new Map<string, { friend: Profile; count: number; latestAt: string }>();
      for (const row of dm ?? []) {
        if (row.unread_count <= 0) continue;
        const existing = prev.get(row.thread_id);
        const friend =
          existing?.friend ??
          dmThreads.find((x) => x.id === row.thread_id)?.friend ??
          threadByFriend.get(row.thread_id)?.friend;
        if (!friend) continue;
        next.set(row.thread_id, {
          friend,
          count: row.unread_count,
          latestAt: row.last_read_at ?? existing?.latestAt ?? new Date().toISOString(),
        });
      }
      return next;
    });

    setGroupUnreadMap((prev) => {
      const next = new Map<string, number>();
      for (const row of grp ?? []) {
        if (row.unread_count > 0) next.set(row.group_id, row.unread_count);
      }
      return next;
    });
  }, [dmThreads]);

  const patchProfileInState = useCallback((updated: Profile) => {
    setProfile((prev) => (prev?.id === updated.id ? { ...prev, ...updated } : prev));
    setDmThreads((prev) =>
      prev.map((t) => (t.friend.id === updated.id ? { ...t, friend: { ...t.friend, ...updated } } : t)),
    );
    setGroupChats((prev) =>
      prev.map((g) => ({
        ...g,
        members: g.members.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)),
      })),
    );
    setMembers((prev) =>
      prev.map((m) => (m.user_id === updated.id ? { ...m, profile: { ...m.profile, ...updated } } : m)),
    );
    setMessages((prev) =>
      prev.map((m) => (m.author_id === updated.id ? { ...m, author: { ...m.author, ...updated } } : m)),
    );
    setDmMessages((prev) =>
      prev.map((m) => (m.author_id === updated.id ? { ...m, author: { ...m.author, ...updated } } : m)),
    );
    setGroupMessages((prev) =>
      prev.map((m) => (m.author_id === updated.id ? { ...m, author: { ...m.author, ...updated } } : m)),
    );
    setFriendships((prev) =>
      prev.map((f) => ({
        ...f,
        requester: f.requester?.id === updated.id ? { ...f.requester, ...updated } : f.requester,
        addressee: f.addressee?.id === updated.id ? { ...f.addressee, ...updated } : f.addressee,
      })),
    );
    setVoicePresence((prev) =>
      prev.map((p) => (p.user_id === updated.id ? { ...p, profile: { ...p.profile, ...updated } } : p)),
    );
    setDmUnreadMap((prev) => {
      const next = new Map(prev);
      for (const [tid, entry] of next) {
        if (entry.friend.id === updated.id) {
          next.set(tid, { ...entry, friend: { ...entry.friend, ...updated } });
        }
      }
      return next;
    });
  }, []);

  const setLiveStatus = useCallback(async (status: UserStatus) => {
    if (!userId) return;
    const current = profileRef.current;
    if (current) {
      patchProfileInState({ ...current, status, updated_at: new Date().toISOString() });
    }
    await getSupabaseClient().from("profiles").update({ status }).eq("id", userId);
    const payload: PresencePayload = { userId, status };
    void presenceChannelRef.current?.track(payload).then();
  }, [userId, patchProfileInState]);

  const trackPresence = useCallback(async (status: UserStatus) => {
    if (!userId) return;
    const payload: PresencePayload = { userId, status };
    void presenceChannelRef.current?.track(payload).then();
  }, [userId]);

  const markActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (autoAwayRef.current) {
      autoAwayRef.current = false;
      const current = profileRef.current;
      const preferred = preferredStatusRef.current;
      if (current && current.status === "idle" && preferred === "online") {
        void setLiveStatus("online");
      }
    }
  }, [setLiveStatus]);

  useEffect(() => {
    inCallRef.current = !!voiceJoinedChannelId || callPhase !== "idle";
  }, [voiceJoinedChannelId, callPhase]);

  useEffect(() => {
    if (!userId || !configured) return;
    const check = () => {
      if (inCallRef.current) return;
      const idleMs = Date.now() - lastActivityRef.current;
      if (idleMs < AWAY_AFTER_MS) return;
      const current = profileRef.current;
      if (!current || current.status !== "online") return;
      if (preferredStatusRef.current !== "online") return;
      autoAwayRef.current = true;
      void setLiveStatus("idle");
    };
    const id = window.setInterval(check, 30_000);
    const onActivity = () => markActivity();
    window.addEventListener("mousedown", onActivity);
    window.addEventListener("keydown", onActivity);
    window.addEventListener("touchstart", onActivity);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("mousedown", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("touchstart", onActivity);
    };
  }, [userId, configured, setLiveStatus, markActivity]);

  useEffect(() => {
    if (!userId || !configured || !profile) return;
    const supabase = getSupabaseClient();
    const channel = supabase.channel(PRESENCE_CHANNEL);
    channel.on("presence", { event: "sync" }, () => {
      setPresenceMap(flattenPresenceState(channel.presenceState() as Record<string, PresencePayload[]>));
    });
    void channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        presenceChannelRef.current = channel;
        const preferred = profileRef.current?.preferred_status ?? "online";
        const live = profileRef.current?.status ?? "online";
        await channel.track({ userId, status: live === "offline" && preferred !== "offline" ? preferred : live } satisfies PresencePayload);
      }
    });
    return () => {
      if (presenceChannelRef.current === channel) presenceChannelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [userId, configured, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadProfile = useCallback(async (uid: string) => {
    const cacheKey = `profile:${uid}`;
    const cached = getCached<Profile>(cacheKey);
    if (cached) {
      setProfile(cached);
      patchProfileInState(cached);
    }
    const supabase = getSupabaseClient();
    const { data } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
    if (data) {
      const p = data as Profile;
      setCache(cacheKey, p);
      setProfile(p);
      patchProfileInState(p);
    }
  }, [patchProfileInState]);

  const ensureProfile = useCallback(async (_uid: string, _email?: string | null) => {
    const supabase = getSupabaseClient();
    const { error } = await supabase.rpc("ensure_user_profile");
    return error?.message ?? null;
  }, []);

  // Resolve Tether's identity once per session so mention chips, the
  // autocomplete entry, and the friend/message/block guards can treat Tether
  // as a proper mention without it being a real server member.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void fetchTetherInfo().then((info) => {
      if (cancelled || !info) return;
      setTetherProfile(info as unknown as Profile);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const refreshCatalysts = useCallback(async (serverIds: string[], uid: string) => {
    if (serverIds.length === 0) {
      setCatalystCounts({});
      setMyCatalysts([]);
      return;
    }
    const supabase = getSupabaseClient();
    const [{ data: all }, { data: mine }] = await Promise.all([
      supabase.from("server_catalysts").select("server_id").in("server_id", serverIds),
      supabase.from("server_catalysts").select("server_id,created_at").eq("user_id", uid),
    ]);
    const counts: Record<string, number> = {};
    for (const row of (all as { server_id: string }[] | null) ?? []) {
      counts[row.server_id] = (counts[row.server_id] ?? 0) + 1;
    }
    setCatalystCounts(counts);
    setMyCatalysts((mine as { server_id: string; created_at: string }[] | null) ?? []);
  }, []);

  const allocateCatalyst = useCallback(async (serverId: string) => {
    if (!userId) return "Not signed in";
    const { error } = await getSupabaseClient()
      .from("server_catalysts")
      .insert({ server_id: serverId, user_id: userId, source: "grant" });
    if (error) return error.message;
    await refreshCatalysts(servers.map((s) => s.id), userId);
    return null;
  }, [userId, servers, refreshCatalysts]);

  const withdrawCatalyst = useCallback(async (serverId: string) => {
    if (!userId) return "Not signed in";

    const { data } = await getSupabaseClient()
      .from("server_catalysts")
      .select("id")
      .eq("server_id", serverId)
      .eq("user_id", userId)
      .eq("source", "grant")
      .order("created_at", { ascending: false })
      .limit(1);
    const row = (data as { id: string }[] | null)?.[0];
    if (!row) return "No catalyst to withdraw";
    const { error } = await getSupabaseClient().from("server_catalysts").delete().eq("id", row.id);
    if (error) return error.message;
    await refreshCatalysts(servers.map((s) => s.id), userId);
    return null;
  }, [userId, servers, refreshCatalysts]);

  const loadServers = useCallback(async (uid: string) => {
    const cacheKey = `servers:${uid}`;
    const cached = getCached<Server[]>(cacheKey);
    if (cached) {
      setServers(cached);
    }
    const supabase = getSupabaseClient();
    const { data: memberships } = await supabase
      .from("server_members")
      .select("server_id")
      .eq("user_id", uid);
    const ids = ((memberships ?? []) as { server_id: string }[]).map((m) => m.server_id);
    if (ids.length === 0) {
      setServers([]);
      setCache(cacheKey, []);
      void refreshCatalysts([], uid);
      return;
    }
    const { data } = await supabase.from("servers").select("*").in("id", ids).order("created_at");
    const servers = (data as Server[]) ?? [];
    setCache(cacheKey, servers);
    setServers(servers);
    void refreshCatalysts(ids, uid);
  }, [refreshCatalysts]);

  const loadServerDetails = useCallback(async (serverId: string) => {
    const cacheKey = `server-details:${serverId}`;
    const cached = getCached<{ categories: ChannelCategory[]; channels: Channel[]; members: (ServerMember & { profile: Profile })[]; roles: ServerRole[] }>(cacheKey);
    if (cached) {
      setCategories(cached.categories);
      setChannels(cached.channels);
      setMembers(cached.members);
      setServerRoles(cached.roles);
    }
    const supabase = getSupabaseClient();
    const [{ data: cats }, { data: chs }, { data: memRows }, { data: roles }, { data: roleRows }] = await Promise.all([
      supabase.from("channel_categories").select("*").eq("server_id", serverId).order("position"),
      supabase.from("channels").select("*").eq("server_id", serverId).order("position"),
      supabase.rpc("get_server_members", { p_server_id: serverId, p_page: 1, p_page_size: 1000 }),
      supabase.from("server_roles").select("*").eq("server_id", serverId).order("position"),
      supabase.from("member_roles").select("server_id, user_id, role_id").eq("server_id", serverId),
    ]);
    const roleIdsByMember = new Map<string, string[]>();
    for (const row of (roleRows ?? []) as { user_id: string; role_id: string }[]) {
      const list = roleIdsByMember.get(row.user_id) ?? [];
      list.push(row.role_id);
      roleIdsByMember.set(row.user_id, list);
    }
    const channelRows = (chs as Channel[]) ?? [];
    const serverRoles = (roles as ServerRole[]) ?? [];
    setCategories((cats as ChannelCategory[]) ?? []);
    setChannels(channelRows);
    setServerRoles(serverRoles);
    void (async () => {
      const now = new Date().toISOString();
      const [{ data: timeoutRows }, { data: banRows }] = await Promise.all([
        supabase.from("server_timeouts").select("*").eq("server_id", serverId).gt("expires_at", now),
        supabase.from("server_bans").select("server_id, user_id, banned_by, reason, created_at").eq("server_id", serverId),
      ]);
      setServerTimeouts((timeoutRows as ServerTimeout[]) ?? []);
      const bans = (banRows ?? []) as Omit<ServerBan, "profile">[];
      if (!bans.length) {
        setServerBans([]);
        return;
      }
      const profiles = await fetchProfilesByIds(supabase, bans.map((b) => b.user_id));
      setServerBans(bans.map((b) => ({ ...b, profile: profiles.get(b.user_id) })));
    })();

    // Fetch all pages of members (PostgREST caps at db-max-rows, default 1000)
    const allMemRows = [...(memRows as (ServerMember & { profile: Profile })[] ?? [])];
    let page = 2;
    while (true) {
      const { data: pageRows } = await supabase.rpc("get_server_members", { p_server_id: serverId, p_page: page, p_page_size: 1000 });
      if (!pageRows || (pageRows as any[]).length === 0) break;
      allMemRows.push(...(pageRows as (ServerMember & { profile: Profile })[]));
      if ((pageRows as any[]).length < 1000) break;
      page++;
    }

    const assignableRoleIds = new Set(
      serverRoles.filter((r) => !r.is_default).map((r) => r.id),
    );
    const sanitizeRoleIds = (ids: string[]) =>
      ids.filter((id) => assignableRoleIds.has(id));
    const memberRows = ((allMemRows as (ServerMember & { profile: Profile })[] | null) ?? []).filter(
      (m) => m.profile != null,
    );
    if (memberRows.length === 0) {
      setMembers([]);
      return channelRows;
    }
    const enrichedMembers = memberRows.map((m) => ({
      ...m,
      role_ids: sanitizeRoleIds(roleIdsByMember.get(m.user_id) ?? []),
    }));
    setMembers(enrichedMembers);
    const uid = sessionRef.current?.user?.id ?? null;
    if (uid) {
      const { data: perms } = await supabase.rpc("my_server_permissions", { p_server_id: serverId });
      if (perms && typeof perms === "object") {
        const p = perms as Record<string, unknown>;
        setServerPermissions({
          kick: !!p.kick,
          ban: !!p.ban,
          manage_roles: !!p.manage_roles,
          manage_server: !!p.manage_server,
          manage_channels: !!p.manage_channels,
          manage_messages: !!p.manage_messages,
          manage_emojis: !!p.manage_emojis,
          mention_everyone: !!p.mention_everyone,
          send_messages: !!p.send_messages,
          add_reactions: !!p.add_reactions,
          attach_files: !!p.attach_files,
          timeout_members: !!p.timeout_members,
          pin_messages: !!p.pin_messages,
          view_audit_log: !!p.view_audit_log,
          create_invites: !!p.create_invites,
        });
      }
      const { data: effects } = await supabase.rpc("my_channel_effects", { p_server_id: serverId });
      if (Array.isArray(effects)) {
        const map: Record<string, ChannelEffects> = {};
        for (const row of effects as (ChannelEffects & { channel_id: string })[]) {
          map[row.channel_id] = {
            can_view: !!row.can_view,
            can_post: !!row.can_post,
            can_react: !!row.can_react,
            can_attach: !!row.can_attach,
          };
        }
        setChannelEffects(map);
      }
    }
    const memForCache = memberRows.length > 0
      ? enrichedMembers
      : [];
    setCache(cacheKey, {
      categories: (cats as ChannelCategory[]) ?? [],
      channels: channelRows,
      members: memForCache,
      roles: (roles as ServerRole[]) ?? [],
    });
    return channelRows;
  }, []);

  const loadMessages = useCallback(async (channelId: string) => {
    const supabase = getSupabaseClient();
    // A failed fetch must never leave the skeleton up forever: fail open
    // to an empty list (the view then shows its empty state, and a retry
    // happens on the next navigation or realtime event).
    try {
      const { data } = await supabase
        .from("messages")
        .select("*, author:profiles(*)")
        .eq("channel_id", channelId)
        .order("created_at", { ascending: false })
        .limit(MESSAGE_PAGE_SIZE + 1);
      if (activeChannelRef.current !== channelId) return;

      const { rows, hasMore } = paginateDescendingRows(data as (Message & { author: Profile })[] | null);
      setMessages(rows);
      setChannelHasMore(hasMore);
      setMessagesLoading(false);

      const ids = rows.map((m) => m.id);
      const rxn = await loadReactionsForMessages(supabase, "channel", ids);
      if (activeChannelRef.current !== channelId) return;
      setMessageReactions((prev) => replaceReactionsForContext(prev, "channel", rxn));
    } catch {
      if (activeChannelRef.current !== channelId) return;
      setMessages([]);
      setChannelHasMore(false);
      setMessagesLoading(false);
    }
  }, []);

  const loadMoreChannelMessages = useCallback(async () => {
    if (!activeChannelId || !channelHasMore || messages.length === 0) return;
    const supabase = getSupabaseClient();
    const oldest = messages[0];
    const { data } = await supabase
      .from("messages")
      .select("*, author:profiles(*)")
      .eq("channel_id", activeChannelId)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .limit(MESSAGE_PAGE_SIZE + 1);
    const { rows: older, hasMore } = paginateDescendingRows(data as (Message & { author: Profile })[] | null);
    if (!older.length) {
      setChannelHasMore(false);
      return;
    }
    setMessages((prev) => [...older, ...prev]);
    setChannelHasMore(hasMore);
    const rxn = await loadReactionsForMessages(
      supabase,
      "channel",
      older.map((m) => m.id),
    );
    setMessageReactions((prev) =>
      mergeReactions(
        prev,
        "channel",
        rxn,
        older.map((m) => m.id),
      ),
    );
  }, [activeChannelId, channelHasMore, messages]);

  const loadFriendships = useCallback(async (uid: string) => {
    const supabase = getSupabaseClient();
    const { data: raw } = await supabase
      .from("friendships")
      .select("*")
      .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`);
    const rows = (raw ?? []) as Friendship[];
    if (!rows.length) {
      setFriendships([]);
      return;
    }
    const ids = [...new Set(rows.flatMap((f) => [f.requester_id, f.addressee_id]))];
    const map = await fetchProfilesByIds(supabase, ids);
    setFriendships(
      rows.map((f) => ({
        ...f,
        requester: map.get(f.requester_id),
        addressee: map.get(f.addressee_id),
      })) as Friendship[],
    );
  }, []);

  const loadDmThreads = useCallback(async (uid: string) => {
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from("dm_threads")
      .select("*")
      .or(`user_a.eq.${uid},user_b.eq.${uid}`);
    const threads = (data as DmThread[]) ?? [];
    const enriched = await Promise.all(
      threads.map(async (t) => {
        const friendId = t.user_a === uid ? t.user_b : t.user_a;
        const { data: fp } = await supabase.from("profiles").select("*").eq("id", friendId).maybeSingle();
        return { ...t, friend: fp as Profile | null };
      }),
    );
    setDmThreads(enriched.filter((t): t is DmThread & { friend: Profile } => !!t.friend));

    const ids = threads.map((t) => t.id);
    if (ids.length) {
      const { data: msgRows } = await supabase
        .from("dm_messages")
        .select("thread_id, created_at")
        .in("thread_id", ids)
        .order("created_at", { ascending: false });
      const activity: Record<string, string> = {};
      for (const row of (msgRows ?? []) as { thread_id: string; created_at: string }[]) {
        if (!activity[row.thread_id]) activity[row.thread_id] = row.created_at;
      }
      if (Object.keys(activity).length) {
        setDmThreadActivity((prev) => ({ ...activity, ...prev }));
      }
    }
  }, []);

  const bumpFriendActivity = useCallback((friendId: string, at?: string) => {
    const ts = at ?? new Date().toISOString();
    setDmThreadActivity((prev) => ({ ...prev, [`friend:${friendId}`]: ts }));
  }, []);

  const bumpDmThreadActivity = useCallback((threadId: string, at?: string) => {
    const ts = at ?? new Date().toISOString();
    setDmThreadActivity((prev) => {
      if (prev[threadId] === ts) return prev;
      return { ...prev, [threadId]: ts };
    });
  }, []);

  const loadNotes = useCallback(async (uid: string) => {
    const { data } = await getSupabaseClient()
      .from("notes")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(MESSAGE_PAGE_SIZE + 1);
    const { rows, hasMore } = paginateDescendingRows(data as Note[] | null);
    setNotes(rows);
    setNotesHasMore(hasMore);
  }, []);

  const loadMoreNotes = useCallback(async () => {
    if (!userId || !notesHasMore || notes.length === 0) return;
    const oldest = notes[0];
    const { data } = await getSupabaseClient()
      .from("notes")
      .select("*")
      .eq("user_id", userId)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .limit(MESSAGE_PAGE_SIZE + 1);
    const { rows: older, hasMore } = paginateDescendingRows(data as Note[] | null);
    if (!older.length) {
      setNotesHasMore(false);
      return;
    }
    setNotes((prev) => {
      const seen = new Set(prev.map((n) => n.id));
      return [...older.filter((n) => !seen.has(n.id)), ...prev];
    });
    setNotesHasMore(hasMore);
  }, [userId, notesHasMore, notes]);

  const loadDmMessages = useCallback(async (threadId: string) => {
    const supabase = getSupabaseClient();
    try {
      const { data } = await supabase
        .from("dm_messages")
        .select("*, author:profiles(*)")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: false })
        .limit(MESSAGE_PAGE_SIZE + 1);

      if (activeDmRef.current !== threadId) return;
      const { rows, hasMore } = paginateDescendingRows(data as (DmMessage & { author: Profile })[] | null);
      setDmMessages(rows);
      setDmHasMore(hasMore);
      setDmLoading(false);
      const ids = rows.map((m) => m.id);
      const rxn = await loadReactionsForMessages(supabase, "dm", ids);
      if (activeDmRef.current !== threadId) return;
      setMessageReactions((prev) => replaceReactionsForContext(prev, "dm", rxn));
    } catch {
      if (activeDmRef.current !== threadId) return;
      setDmMessages([]);
      setDmHasMore(false);
      setDmLoading(false);
    }
  }, []);

  const loadMoreDmMessages = useCallback(async () => {
    if (!activeDmThreadId || !dmHasMore || dmMessages.length === 0) return;
    const supabase = getSupabaseClient();
    const oldest = dmMessages[0];
    const { data } = await supabase
      .from("dm_messages")
      .select("*, author:profiles(*)")
      .eq("thread_id", activeDmThreadId)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .limit(MESSAGE_PAGE_SIZE + 1);

    if (activeDmRef.current !== activeDmThreadId) return;
    const { rows: older, hasMore } = paginateDescendingRows(data as (DmMessage & { author: Profile })[] | null);
    if (!older.length) {
      setDmHasMore(false);
      return;
    }
    setDmMessages((prev) => [...older, ...prev]);
    setDmHasMore(hasMore);
    const rxn = await loadReactionsForMessages(
      supabase,
      "dm",
      older.map((m) => m.id),
    );
    if (activeDmRef.current !== activeDmThreadId) return;
    setMessageReactions((prev) =>
      mergeReactions(
        prev,
        "dm",
        rxn,
        older.map((m) => m.id),
      ),
    );
  }, [activeDmThreadId, dmHasMore, dmMessages]);

  const loadGroupChats = useCallback(async (uid: string) => {    const supabase = getSupabaseClient();
    const { data: memberships } = await supabase
      .from("group_chat_members")
      .select("group_id")
      .eq("user_id", uid);
    const ids = ((memberships ?? []) as { group_id: string }[]).map((m) => m.group_id);
    if (!ids.length) {
      setGroupChats([]);
      return;
    }
    const [{ data: groups }, { data: allMembers }] = await Promise.all([
      supabase.from("group_chats").select("*").in("id", ids).order("created_at"),
      supabase.from("group_chat_members").select("group_id, user_id").in("group_id", ids),
    ]);
    const memberRows = (allMembers ?? []) as { group_id: string; user_id: string }[];
    const profileIds = [...new Set(memberRows.map((m) => m.user_id))];
    const profileMap = await fetchProfilesByIds(supabase, profileIds);
    setGroupChats(
      ((groups ?? []) as GroupChatWithMembers[]).map((g) => ({
        ...g,
        members: memberRows
          .filter((m) => m.group_id === g.id)
          .map((m) => profileMap.get(m.user_id))
          .filter((p): p is Profile => !!p),
      })),
    );
  }, []);

  const refreshGroupChats = useCallback(async () => {
    if (!userId) return;
    await loadGroupChats(userId);
  }, [userId, loadGroupChats]);

  const loadGroupMessages = useCallback(async (groupId: string) => {
    const supabase = getSupabaseClient();
    try {
      const { data } = await supabase
        .from("group_messages")
        .select("*, author:profiles(*)")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false })
        .limit(MESSAGE_PAGE_SIZE + 1);

      if (activeGroupRef.current !== groupId) return;
      const { rows, hasMore } = paginateDescendingRows(data as (GroupMessage & { author?: Profile | null })[] | null);
      setGroupMessages(rows);
      setGroupHasMore(hasMore);
      setGroupLoading(false);
      const ids = rows.map((m) => m.id);
      const rxn = await loadReactionsForMessages(supabase, "group", ids);
      if (activeGroupRef.current !== groupId) return;
      setMessageReactions((prev) => replaceReactionsForContext(prev, "group", rxn));
    } catch {
      if (activeGroupRef.current !== groupId) return;
      setGroupMessages([]);
      setGroupHasMore(false);
      setGroupLoading(false);
    }
  }, []);

  const loadMoreGroupMessages = useCallback(async () => {
    if (!activeGroupChatId || !groupHasMore || groupMessages.length === 0) return;
    const supabase = getSupabaseClient();
    const oldest = groupMessages[0];
    const { data } = await supabase
      .from("group_messages")
      .select("*, author:profiles(*)")
      .eq("group_id", activeGroupChatId)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .limit(MESSAGE_PAGE_SIZE + 1);

    if (activeGroupRef.current !== activeGroupChatId) return;
    const { rows: older, hasMore } = paginateDescendingRows(data as (GroupMessage & { author?: Profile | null })[] | null);
    if (!older.length) {
      setGroupHasMore(false);
      return;
    }
    setGroupMessages((prev) => [...older, ...prev]);
    setGroupHasMore(hasMore);
    const rxn = await loadReactionsForMessages(
      supabase,
      "group",
      older.map((m) => m.id),
    );
    if (activeGroupRef.current !== activeGroupChatId) return;
    setMessageReactions((prev) =>
      mergeReactions(
        prev,
        "group",
        rxn,
        older.map((m) => m.id),
      ),
    );
  }, [activeGroupChatId, groupHasMore, groupMessages]);

  const loadNotifications = useCallback(async (uid: string) => {
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(30);
    setNotifications((data as AppNotification[]) ?? []);
  }, []);

  const loadCustomEmoji = useCallback(async (serverId: string) => {
    const { data } = await getSupabaseClient()
      .from("custom_emoji")
      .select("name,url")
      .eq("server_id", serverId);
    const map: Record<string, string> = {};
    for (const row of (data as { name: string; url: string }[] | null) ?? []) {
      if (row.name && row.url) map[row.name] = row.url;
    }
    setCustomEmojiMap(map);
  }, []);

  const loadServerOrganization = useCallback(async () => {
    const supabase = getSupabaseClient();
    const [{ data: folders }, { data: states }] = await Promise.all([
      supabase.from("server_folders").select("*").order("position"),
      supabase.from("server_list_state").select("*"),
    ]);
    setServerFolders((folders as ServerFolder[]) ?? []);
    setServerListState((states as ServerListState[]) ?? []);
  }, []);

  const refreshAll = useCallback(async () => {
    if (!userId) return;
    await Promise.all([
      loadProfile(userId),
      loadServers(userId),
      loadFriendships(userId),
      loadDmThreads(userId),
      loadGroupChats(userId),
      loadNotifications(userId),
      loadServerOrganization(),
    ]);

    await seedUnread(userId);
    if (activeServerId) await loadServerDetails(activeServerId);
    if (activeChannelId) await loadMessages(activeChannelId);
    if (activeDmThreadId) await loadDmMessages(activeDmThreadId);
    if (activeGroupChatId) await loadGroupMessages(activeGroupChatId);
  }, [userId, activeServerId, activeChannelId, activeDmThreadId, activeGroupChatId, loadProfile, loadServers, loadFriendships, loadDmThreads, loadGroupChats, loadNotifications, loadServerOrganization, loadServerDetails, loadMessages, loadDmMessages, loadGroupMessages, seedUnread]);

  useEffect(() => {
    if (!configured) {
      setReady(true);
      return;
    }
    const supabase = getSupabaseClient();

    void (async () => {
      const { data } = await supabase.auth.getSession();
      let session = data.session;

      if (session) {
        if (isAccessTokenExpired(session)) {

          let refreshed: { session: Session | null } | null = null;
          let retryError: unknown = null;
          for (let attempt = 0; attempt < 3; attempt++) {
            const result = await refreshSessionOnce();
            if ("session" in result) {
              refreshed = { session: (result.session as Session | null) };
              break;
            }
            retryError = result.error;
            if ((result.error as { status?: number })?.status !== 429) break;
            await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
          }
          const error = retryError as { name?: string; status?: number } | null;
          if (error) {
            console.warn("Session token was expired and could not be refreshed.", error);
          }
          session = refreshed?.session ?? (error?.name === "AuthRetryableFetchError" ? session : null);
        } else {
          const { error: verifyError } = await supabase.auth.getUser();
          if (verifyError) {
            if (verifyError.name === "AuthRetryableFetchError") {
              console.warn("Could not reach Supabase to verify the session; continuing with the cached session.", verifyError);
            } else {
              const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
              if (refreshError) {

                if (refreshError.name === "AuthRetryableFetchError") {
                  console.warn("Could not refresh the session due to a transient error; continuing with the cached session.", refreshError);
                } else {
                  console.warn("Session is rejected by Supabase and could not be refreshed; signing out.", refreshError);
                  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
                  session = null;
                }
              } else {
                session = refreshed.session;
              }
            }
          }
        }
      }

      setSession(session);
      if (session) rememberSession(session);
      setReady(true);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {

      if (!s) {
        const current = sessionRef.current;

        if (current && !signingOutRef.current) return;
      }
      signingOutRef.current = false;
      setSession(s);

      if (_e === "SIGNED_IN" && s) {
        void refreshOwnBadges(s.user.id);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [configured, rememberSession]);

  useEffect(() => {
    if (!configured) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void (async () => {

        const session = sessionRef.current;
        if (!session || !isAccessTokenExpired(session)) return;

        const result = await refreshSessionOnce();
        if ("error" in result) return;
        if (result.session) {
          await refreshAll();
        }
      })();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [configured, refreshAll]);

  useEffect(() => {
    if (!configured) return;
    const marginMs = 60_000;
    const minDelayMs = 30_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      const session = sessionRef.current;
      if (!session || !session.expires_at || isAccessTokenExpired(session)) return;
      const delayMs = Math.max(minDelayMs, session.expires_at * 1000 - Date.now() - marginMs);
      timer = setTimeout(() => {
        void (async () => {
          const result = await refreshSessionOnce();
          if ("session" in result && result.session) {
            await refreshAll();
          }
        })().finally(schedule);
      }, delayMs);
    };
    schedule();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [configured, refreshAll]);

  const refreshMfaStatus = useCallback(async () => {
    if (!configured) {
      setMfaRequired(false);
      return;
    }

    const current = sessionRef.current;
    if (!current) {
      setMfaRequired(false);
      return;
    }

    if (isAccessTokenExpired(current)) {
      return;
    }
    try {
      const assurance = await getMfaAssurance();
      setMfaRequired(assurance.mfaRequired);
    } catch {

    }
  }, [configured]);

  const refreshPlatformAccess = useCallback(async () => {
    const s = sessionRef.current;
    if (!s || isAccessTokenExpired(s)) {
      setPlatformBan(null);
      return;
    }
    try {
      const res = await apiFetch("/api/moderation/access", {
        headers: { Authorization: `Bearer ${s.access_token}` },
      });
      if (!res.ok) {
        setPlatformBan(null);
        return;
      }
      const json = (await res.json()) as { banned?: boolean; reason?: string; vpnBlocked?: boolean };
      setPlatformBan(json.banned ? { banned: true, reason: json.reason, vpnBlocked: json.vpnBlocked } : null);
    } catch {
      setPlatformBan(null);
    }
  }, []);

  const refreshRestrictions = useCallback(async () => {
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from("account_restrictions")
      .select("restriction");
    setRestrictions((data as { restriction: string }[] | null)?.map((r) => r.restriction) ?? []);
  }, []);

  const hasRestriction = useCallback(
    (restriction: string) => restrictions.includes(restriction),
    [restrictions],
  );

  useEffect(() => {
    if (!session) {
      setMfaRequired(false);
      setPlatformBan(null);
      setRestrictions([]);
      return;
    }
    void refreshMfaStatus();
    void refreshPlatformAccess();
    void refreshRestrictions();
    const interval = setInterval(() => { void refreshPlatformAccess(); }, 60_000);
    return () => clearInterval(interval);
  }, [session, refreshMfaStatus, refreshPlatformAccess, refreshRestrictions]);

  useEffect(() => {
    if (!userId || !configured) return;
    const supabase = getSupabaseClient();
    const channel = supabase
      .channel(`platform-ban:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "platform_bans", filter: `user_id=eq.${userId}` },
        () => { void refreshPlatformAccess(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId, configured, refreshPlatformAccess]);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setServers([]);
      setDataLoaded(false);
      setHydrated(false);
      imagesWarmedRef.current = false;
      return;
    }

    let cancelled = false;
    setDataLoaded(false);
    setHydrated(false);
    imagesWarmedRef.current = false;

    void (async () => {
      try {
        await ensureProfile(userId, user?.email);
        await refreshAll();
      } catch (err) {

        console.error("Initial load failed:", err);
      } finally {
        if (!cancelled) setDataLoaded(true);
      }
      void primeNotificationPermission();
    })();

    const timeout = window.setTimeout(() => {
      if (!cancelled) {
        setDataLoaded(true);
        setHydrated(true);
      }
    }, 10_000);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!dataLoaded || hydrated || imagesWarmedRef.current) return;
    imagesWarmedRef.current = true;

    const urls: (string | null | undefined)[] = [
      profile?.avatar_url,
      ...friends.map((f) => f.avatar_url),
      ...dmThreads.map((t) => t.friend?.avatar_url),
      ...servers.map((s) => s.icon_url),
      ...groupChats.flatMap((g) => [g.icon_url, ...g.members.map((m) => m.avatar_url)]),
    ];

    void preloadImages(urls).finally(() => setHydrated(true));
  }, [dataLoaded, hydrated, profile, friends, dmThreads, servers, groupChats]);

  useEffect(() => {
    if (!userId || !configured) return;
    const supabase = getSupabaseClient();

    const profileSub = supabase
      .channel(`profiles:${userId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` }, () => {
        void loadProfile(userId);
      })
      .subscribe();

    const catalystSub = supabase
      .channel(`catalysts:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "server_catalysts" }, () => {
        void refreshCatalysts(serversRef.current.map((s) => s.id), userId);
      })
      .subscribe();

    const notifSub = supabase
      .channel(`notif:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (payload) => {
        const n = payload.new as AppNotification;
        setNotifications((prev) => [n, ...prev]);
        const target = parseNotificationLink(n.link);
        if (target?.kind === "channel") {
          const channel = channelsRef.current.find((c) => c.id === target.channelId);
          if (channel) {
            setServerIndicators((prev) => new Set(prev).add(channel.server_id));
          }
        }
        if (n.type === "mention" && target) {
          alertMention(n.title, n.body ?? undefined, target);
        } else {
          notifyUser(n.title, n.body ?? undefined, target ?? undefined);
        }
      })
      .subscribe();

    const friendSub = supabase
      .channel(`friends:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => void loadFriendships(userId))
      .subscribe();

    const notesSub = supabase
      .channel(`notes:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notes", filter: `user_id=eq.${userId}` }, (payload) => {
        if (payload.eventType === "DELETE") {
          const gone = payload.old as { id: string };
          setNotes((prev) => prev.filter((n) => n.id !== gone.id));
          return;
        }
        const row = payload.new as Note;
        setNotes((prev) => {

          const without = prev.filter(
            (n) => n.id !== row.id && !(n.id.startsWith("opt-") && n.content === row.content && (n.attachment_url ?? null) === (row.attachment_url ?? null)),
          );
          const next = [...without, row].sort((a, b) => a.created_at.localeCompare(b.created_at));
          const { messages: windowed, trimmed } = trimToLatestWindow(next);
          if (trimmed) setNotesHasMore(true);
          return windowed;
        });
      })
      .subscribe();

    return () => {
      void profileSub.unsubscribe();
      void catalystSub.unsubscribe();
      void notifSub.unsubscribe();
      void friendSub.unsubscribe();
      void notesSub.unsubscribe();
    };
  }, [userId, configured, loadFriendships, loadProfile, refreshCatalysts]);

  const friendIdsKey = friends.map((f) => f.id).sort().slice(0, 200).join(",");
  useEffect(() => {
    if (!userId || !configured || friendIdsKey === "") return;
    const sub = getSupabaseClient()
      .channel(`profiles:friends:${userId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=in.(${friendIdsKey})` },
        () => void loadFriendships(userId),
      )
      .subscribe();
    return () => {
      void sub.unsubscribe();
    };
  }, [userId, configured, friendIdsKey, loadFriendships]);

  useEffect(() => {
    if (!activeChannelId || !configured || !userId) return;
    void loadMessages(activeChannelId);
    const supabase = getSupabaseClient();
    const sub = supabase
      .channel(`msg:${activeChannelId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${activeChannelId}` },
        (payload) => {
          const msg = payload.new as Message;

          if (activeChannelRef.current !== activeChannelId) return;
          void (async () => {
            let author: Profile | undefined = profile ?? undefined;
            if (msg.author_id !== userId) {
              const { data } = await supabase.from("profiles").select("*").eq("id", msg.author_id).maybeSingle();
              author = data as Profile | undefined;
            }
            setMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;
              const withoutDupes = prev.filter(
                (m) => !(m.id.startsWith("opt-") && matchesOptimisticRow(m, msg)),
              );
              if (!author) return withoutDupes;
              return [...withoutDupes, { ...msg, author }];
            });
          })();
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages", filter: `channel_id=eq.${activeChannelId}` },
        (payload) => {
          const id = (payload.old as { id?: string }).id;
          if (id) setMessages((prev) => prev.filter((m) => m.id !== id));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `channel_id=eq.${activeChannelId}` },
        (payload) => {
          const updated = payload.new as Message;

          if (activeChannelRef.current !== activeChannelId) return;
          setMessages((prev) =>
            prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)),
          );
        },
      )
      .subscribe();
    return () => {
      void sub.unsubscribe();
    };
  }, [activeChannelId, configured, userId, loadMessages, profile]);

  useEffect(() => {
    if (!activeDmThreadId || !configured || !userId) return;
    void loadDmMessages(activeDmThreadId);
    const supabase = getSupabaseClient();
    const sub = supabase
      .channel(`dm:${activeDmThreadId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "dm_messages", filter: `thread_id=eq.${activeDmThreadId}` },
        (payload) => {
          const msg = payload.new as DmMessage;

          if (msg.thread_id !== activeDmRef.current) return;
          void (async () => {
            let author: Profile | undefined = profile ?? undefined;
            if (msg.author_id !== userId) {
              const { data } = await supabase.from("profiles").select("*").eq("id", msg.author_id).maybeSingle();
              author = data as Profile | undefined;
            }
            setDmMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;
              const withoutDupes = prev.filter(
                (m) => !(m.id.startsWith("opt-") && matchesOptimisticRow(m, msg)),
              );
              if (!author) return withoutDupes;
              return [...withoutDupes, { ...msg, author }];
            });
            bumpDmThreadActivity(msg.thread_id, msg.created_at);
            if (msg.author_id !== userId && author) {

              void markDmReadNow(msg.thread_id);
              alertIncomingDm(
                displayName(author),
                msg.content.slice(0, 120) || undefined,
                profileRef.current,
                msg.thread_id,
              );
            }
          })();
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "dm_messages", filter: `thread_id=eq.${activeDmThreadId}` },
        (payload) => {
          const id = (payload.old as { id?: string }).id;
          if (id) setDmMessages((prev) => prev.filter((m) => m.id !== id));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "dm_messages", filter: `thread_id=eq.${activeDmThreadId}` },
        (payload) => {
          const updated = payload.new as DmMessage;
          setDmMessages((prev) =>
            prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)),
          );
        },
      )
      .subscribe();
    return () => {
      void sub.unsubscribe();
    };
  }, [activeDmThreadId, configured, userId, loadDmMessages, profile, bumpDmThreadActivity]);

  useEffect(() => {
    if (!activeGroupChatId || !configured || !userId) return;
    void loadGroupMessages(activeGroupChatId);
    const supabase = getSupabaseClient();
    const sub = supabase
      .channel(`group:${activeGroupChatId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "group_messages", filter: `group_id=eq.${activeGroupChatId}` },
        (payload) => {
          const msg = payload.new as GroupMessage;

          if (msg.group_id !== activeGroupRef.current) return;
          void (async () => {
            if (msg.author_id == null) {
              setGroupMessages((prev) =>
                prev.some((m) => m.id === msg.id) ? prev : [...prev, { ...msg }],
              );
              return;
            }
            let author: Profile | undefined = profile ?? undefined;
            if (msg.author_id !== userId) {
              const { data } = await supabase.from("profiles").select("*").eq("id", msg.author_id).maybeSingle();
              author = data as Profile | undefined;
            }
            setGroupMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;
              const withoutDupes = prev.filter(
                (m) => !(m.id.startsWith("opt-") && matchesOptimisticRow(m, msg)),
              );
              if (!author) return withoutDupes;
              return [...withoutDupes, { ...msg, author }];
            });
          })();
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "group_messages", filter: `group_id=eq.${activeGroupChatId}` },
        (payload) => {
          const id = (payload.old as { id?: string }).id;
          if (id) setGroupMessages((prev) => prev.filter((m) => m.id !== id));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "group_messages", filter: `group_id=eq.${activeGroupChatId}` },
        (payload) => {
          const updated = payload.new as GroupMessage;
          setGroupMessages((prev) =>
            prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)),
          );
        },
      )
      .subscribe();
    return () => { void sub.unsubscribe(); };
  }, [activeGroupChatId, configured, userId, loadGroupMessages, profile]);

  useEffect(() => {
    if (!userId || !configured || groupChats.length === 0) return;
    const supabase = getSupabaseClient();
    const subs = groupChats.map((g) =>
      supabase
        .channel(`gcm:${g.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "group_chat_members", filter: `group_id=eq.${g.id}` },
          () => void loadGroupChats(userId),
        )
        .subscribe(),
    );
    return () => { subs.forEach((s) => void s.unsubscribe()); };
  }, [userId, configured, groupChats.map((g) => g.id).join(","), loadGroupChats]);

  useEffect(() => {
    if (!activeServerId || !configured) {
      setCustomEmojiMap({});
      return;
    }
    void loadCustomEmoji(activeServerId);
  }, [activeServerId, configured, loadCustomEmoji]);

  useEffect(() => {
    if (!activeServerId || !configured) return;
    const supabase = getSupabaseClient();
    const sub = supabase
      .channel(`sm:${activeServerId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "server_members", filter: `server_id=eq.${activeServerId}` },
        () => void loadServerDetails(activeServerId),
      )
      .subscribe();
    return () => { void sub.unsubscribe(); };
  }, [activeServerId, configured, loadServerDetails]);

  useEffect(() => {
    if (!userId || !configured || groupChats.length === 0) {
      setGroupCallCounts(new Map());
      return;
    }
    const supabase = getSupabaseClient();
    const loadCounts = async () => {
      const ids = groupChats.map((g) => g.id);
      const { data } = await supabase.from("group_call_presence").select("group_id").in("group_id", ids);
      const counts = new Map<string, number>();
      (data ?? []).forEach((r: { group_id: string }) => {
        counts.set(r.group_id, (counts.get(r.group_id) ?? 0) + 1);
      });
      setGroupCallCounts(counts);
    };
    void loadCounts();
    const subs = groupChats.map((g) =>
      supabase
        .channel(`gcp-badge:${g.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "group_call_presence", filter: `group_id=eq.${g.id}` },
          () => void loadCounts(),
        )
        .subscribe(),
    );
    return () => { subs.forEach((s) => void s.unsubscribe()); };
  }, [userId, configured, groupChats.map((g) => g.id).join(",")]);

  useEffect(() => {
    if (!userId || !configured) return;
    const supabase = getSupabaseClient();
    const sub = supabase
      .channel(`profile:${userId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` },
        (payload) => {
          patchProfileInState(payload.new as Profile);
        },
      )
      .subscribe();
    return () => { void sub.unsubscribe(); };
  }, [userId, configured, patchProfileInState]);

  useEffect(() => {
    if (!userId || !configured || friends.length === 0) return;
    const supabase = getSupabaseClient();
    const channel = supabase.channel(`friend-profiles:${userId}`);
    for (const friend of friends) {
      channel.on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${friend.id}` },
        (payload) => patchProfileInState(payload.new as Profile),
      );
    }
    channel.subscribe();
    return () => { void channel.unsubscribe(); };
  }, [userId, configured, friends.map((f) => f.id).sort().join(","), patchProfileInState]);

  useEffect(() => {
    if (!configured || !activeServerId || members.length === 0) return;
    const supabase = getSupabaseClient();
    const ids = [...new Set(members.map((m) => m.user_id))].filter((id) => id !== userId);
    if (ids.length === 0) return;
    const channel = supabase.channel(`member-profiles:${activeServerId}`);
    for (const id of ids) {
      channel.on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${id}` },
        (payload) => patchProfileInState(payload.new as Profile),
      );
    }
    channel.subscribe();
    return () => { void channel.unsubscribe(); };
  }, [configured, activeServerId, userId, members.map((m) => m.user_id).sort().join(","), patchProfileInState]);

  useEffect(() => {
    if (!userId || !configured || groupChats.length === 0) return;
    const ids = new Set<string>();
    for (const group of groupChats) {
      for (const member of group.members) ids.add(member.id);
    }
    ids.delete(userId);
    if (ids.size === 0) return;
    const supabase = getSupabaseClient();
    const channel = supabase.channel(`group-profiles:${userId}`);
    for (const id of ids) {
      channel.on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${id}` },
        (payload) => patchProfileInState(payload.new as Profile),
      );
    }
    channel.subscribe();
    return () => { void channel.unsubscribe(); };
  }, [
    userId,
    configured,
    groupChats
      .map((g) => `${g.id}:${g.members.map((m) => m.id).sort().join(",")}`)
      .sort()
      .join("|"),
    patchProfileInState,
  ]);

  useEffect(() => {
    if (!profile) return;
    preferredStatusRef.current = profile.preferred_status ?? profile.status;
  }, [profile?.id, profile?.preferred_status, profile?.status]);

  useEffect(() => {
    if (!userId || !profile || !configured) return;
    const preferred = profile.preferred_status ?? profile.status;
    preferredStatusRef.current = preferred;
    if (profile.status === "offline" && preferred !== "offline") {
      void setLiveStatus(preferred);
    }
  }, [userId, profile?.id, configured, setLiveStatus]);

  useEffect(() => {
    if (!userId || !configured) return;
    const supabase = getSupabaseClient();
    const sub = supabase
      .channel(`reactions:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message_reactions" },
        (payload) => {
          const r = payload.new as MessageReaction;
          setMessageReactions((prev) =>
            prev.some((x) => x.id === r.id) ? prev : [...prev, r],
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "message_reactions" },
        (payload) => {
          const old = payload.old as { id?: string };
          if (old.id) setMessageReactions((prev) => prev.filter((r) => r.id !== old.id));
        },
      )
      .subscribe();
    return () => { void sub.unsubscribe(); };
  }, [userId, configured]);

  useEffect(() => {
    if (!userId || !configured) return;
    const supabase = getSupabaseClient();
    const sub = supabase
      .channel(`dm-unread:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "dm_messages" },
        (payload) => {
          const msg = payload.new as DmMessage;
          if (msg.author_id === userId) return;
          const inActiveDmChat =
            viewModeRef.current === "dm" && activeDmRef.current === msg.thread_id;
          if (inActiveDmChat) return;

          void (async () => {
            const { data: author } = await supabase.from("profiles").select("*").eq("id", msg.author_id).maybeSingle();
            if (!author) return;
            setDmUnreadMap((prev) => {
              const next = new Map(prev);
              const cur = next.get(msg.thread_id);
              next.set(msg.thread_id, {
                friend: author as Profile,
                count: (cur?.count ?? 0) + 1,
                latestAt: msg.created_at,
              });
              return next;
            });
            bumpDmThreadActivity(msg.thread_id, msg.created_at);
            if (!dmThreadsRef.current.some((t) => t.id === msg.thread_id)) {

              void loadDmThreads(userId);
            }
            alertIncomingDm(
              displayName(author as Profile),
              msg.content.slice(0, 120) || undefined,
              profileRef.current,
              msg.thread_id,
            );
          })();
        },
      )
      .subscribe();
    return () => { void sub.unsubscribe(); };
  }, [userId, configured, bumpDmThreadActivity, loadDmThreads]);

  useEffect(() => {
    if (!userId || !configured) return;
    const supabase = getSupabaseClient();

    const isMine = (userIdCol: string | undefined) =>
      userId !== undefined && userIdCol !== undefined && userIdCol === userId;
    const sub = supabase
      .channel(`read-sync:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "dm_thread_reads" },
        (payload) => {
          const p = payload.new as { user_id?: string };
          if (isMine(p.user_id)) void seedUnread(userId);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "dm_thread_reads" },
        (payload) => {
          const p = payload.new as { user_id?: string };
          if (isMine(p.user_id)) void seedUnread(userId);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "group_chat_members" },
        (payload) => {
          const p = payload.new as { user_id?: string };
          if (isMine(p.user_id)) void seedUnread(userId);
        },
      )
      .subscribe();
    return () => { void sub.unsubscribe(); };
  }, [userId, configured, seedUnread]);

  useEffect(() => {
    if (!userId || !configured) return;
    const supabase = getSupabaseClient();
    const sub = supabase
      .channel(`msg-notify:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as Message;
          if (msg.author_id === userId) return;
          const channel = channelsRef.current.find((c) => c.id === msg.channel_id);
          const viewingChannel =
            viewModeRef.current === "space" && activeChannelRef.current === msg.channel_id;
          if (channel && !viewingChannel) {
            setChannelUnreadMap((prev) => {
              const next = new Map(prev);
              next.set(msg.channel_id, (next.get(msg.channel_id) ?? 0) + 1);
              return next;
            });
            if (msg.mentions?.includes(userId)) {
              setChannelMentionMap((prev) => {
                const next = new Map(prev);
                next.set(msg.channel_id, (next.get(msg.channel_id) ?? 0) + 1);
                return next;
              });
            }
            setServerIndicators((prev) => new Set(prev).add(channel.server_id));
          }
          if (msg.mentions?.includes(userId)) return;
          if (!channel) return;
          void (async () => {
            const { data: author } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", msg.author_id)
              .maybeSingle();
            if (!author) return;
            notifyUser(
              `#${channel.name}`,
              `${displayName(author as Profile)}: ${msg.content.slice(0, 120)}`,
              { kind: "channel", channelId: msg.channel_id },
            );
          })();
        },
      )
      .subscribe();
    return () => { void sub.unsubscribe(); };
  }, [userId, configured]);

  useEffect(() => {
    if (!userId || !configured || servers.length === 0) return;
    const supabase = getSupabaseClient();
    const subs = servers.map((server) => {
      const ch = supabase.channel(`typing:server:${server.id}`, {
        config: { broadcast: { self: false } },
      });
      ch.on("broadcast", { event: "typing" }, ({ payload }) => {
        const p = payload as { userId?: string; channelId?: string };
        if (!p.userId || p.userId === userId) return;
        const viewing =
          viewModeRef.current === "space"
          && activeServerRef.current === server.id
          && activeChannelRef.current === p.channelId;
        if (viewing) return;
        setServerIndicators((prev) => new Set(prev).add(server.id));
      });
      void ch.subscribe();
      return ch;
    });
    return () => {
      subs.forEach((sub) => void sub.unsubscribe());
    };
  }, [userId, configured, servers.map((s) => s.id).join(",")]);

  useEffect(() => {
    if (!userId || !configured) return;
    const supabase = getSupabaseClient();
    const sub = supabase
      .channel(`group-notify:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "group_messages" },
        (payload) => {
          const msg = payload.new as GroupMessage;
          if (msg.author_id === userId) return;

          if (msg.mentions?.includes(userId)) return;
          const group = groupChatsRef.current.find((g) => g.id === msg.group_id);
          if (!group) return;

          if (!(viewModeRef.current === "group" && activeGroupRef.current === msg.group_id)) {
            setGroupUnreadMap((prev) => {
              const next = new Map(prev);
              next.set(msg.group_id, (next.get(msg.group_id) ?? 0) + 1);
              return next;
            });
          }
        },
      )
      .subscribe();
    return () => { void sub.unsubscribe(); };
  }, [userId, configured]);

  const signIn = useCallback(async (email: string, password: string) => {
    // Pre-gate: per-IP/email rate limit + VPN/proxy block (login only —
    // saved sessions and active sessions are never re-checked).
    try {
      const gate = await apiFetch("/api/auth/login-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!gate.ok) {
        const json = (await gate.json().catch(() => null)) as { error?: string } | null;
        return json?.error ?? "Sign-in is temporarily blocked. Try again later.";
      }
    } catch {
      // Fail-open on network error here: the server gate itself is
      // fail-closed when reachable, but a client that can't reach the
      // API at all can't sign in anyway.
    }
    const supabase = getSupabaseClient();
    await supabase.auth.signOut({ scope: "local" });
    resetSupabaseClient();
    setProfile(null);

    const { data, error } = await getSupabaseClient().auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) return mapAuthError(error.message);
    if (data.session) rememberSession(data.session);
    await refreshMfaStatus();
    return null;
  }, [refreshMfaStatus, rememberSession]);

  const signUp = useCallback(async (email: string, password: string, username: string, referralCode?: string | null, turnstileToken?: string | null): Promise<SignUpResult> => {
    const supabase = getSupabaseClient();
    const normalized = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    const displayNameVal = username.trim();
    const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/` : undefined;

    try {
      const checkRes = await apiFetch("/api/auth/signup-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), username: normalized, ...(turnstileToken ? { turnstileToken } : {}) }),
      });
      if (!checkRes.ok) {
        const json = (await checkRes.json()) as { error?: string };
        return { error: json.error ?? "Account creation is not allowed right now." };
      }
    } catch {

    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: {
          username: normalized,
          display_name: displayNameVal,

          ...(referralCode ? { referral_code: referralCode } : {}),
        },
      },
    });

    if (error) {
      return { error: mapProfileError(mapAuthError(error.message), error.code) };
    }

    if (data.session) {
      rememberSession(data.session);
      const { error: profileError } = await supabase.rpc("complete_signup_profile", {
        p_username: normalized,
        p_display_name: displayNameVal,
      });
      if (profileError) return { error: mapProfileError(profileError.message, profileError.code) };
      return { error: null, needsEmailConfirmation: false };
    }

    return { error: null, needsEmailConfirmation: true };
  }, [rememberSession]);

  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await getSupabaseClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: getAuthRedirectUrl("/reset-password"),
    });
    return error ? mapAuthError(error.message) : null;
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await getSupabaseClient().auth.updateUser({ password });
    return error ? mapAuthError(error.message) : null;
  }, []);

  const signOut = useCallback(async () => {
    signingOutRef.current = true;
    if (userId) {
      await getSupabaseClient().from("profiles").update({ status: "offline" }).eq("id", userId);
    }
    await getSupabaseClient().auth.signOut({ scope: "local" });
    resetSupabaseClient();
    setProfile(null);
    setViewMode("home");
    setActiveServerId(null);
    setActiveChannelId(null);
    setActiveDmThreadId(null);
    setActiveGroupChatId(null);
    setNotes([]);
    setNotesHasMore(false);
    if (typeof window !== "undefined") {
      window.location.href = isTauri() ? "/app" : "/home";
    }
  }, [userId]);

  const switchAccount = useCallback(async (account: SavedSession) => {
    const tokens = getSavedSessionTokens(account.user_id);
    if (!tokens) return "Sign in again to continue as this account.";
    resetSupabaseClient();
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.setSession(tokens);
    if (error || !data.session) {
      clearSavedSessionTokens(account.user_id);
      setSession(null);
      return "Sign in again to continue as this account.";
    }
    setSession(data.session);
    rememberSession(data.session);
    void refreshSessionOnce().then((r) => {
      if ("session" in r && r.session) {
        const refreshed = r.session as Session;
        setSession(refreshed);
        rememberSession(refreshed);
      }
    });
    return null;
  }, [rememberSession]);

  const updateProfile = useCallback(async (patch: Partial<Profile>) => {
    if (!userId || !profile) return "Not signed in";
    const payload = { ...patch };
    delete payload.show_owner_badge;
    delete payload.show_staff_badge;
    if (payload.username) payload.username = payload.username.trim().toLowerCase();
    if (payload.display_name) payload.display_name = payload.display_name.trim();
    if (typeof payload.bio === "string") {
      const bioErr = bioLengthError(payload.bio, maxBioLengthRef.current);
      if (bioErr) return bioErr;
    }
    if (payload.status !== undefined) {
      payload.preferred_status = payload.status;
      preferredStatusRef.current = payload.status;
      autoAwayRef.current = false;
    }
    const optimistic = { ...profile, ...payload, updated_at: new Date().toISOString() };
    patchProfileInState(optimistic);
    if (typeof payload.status === "string") {
      void trackPresence(payload.status);
    }
    const { error } = await getSupabaseClient().from("profiles").update(payload).eq("id", userId);
    if (error) {
      await loadProfile(userId);
      return mapProfileError(error.message, error.code);
    }
    await loadProfile(userId);
    return null;
  }, [userId, profile, patchProfileInState, loadProfile, trackPresence]);

  const persistActiveServerChannel = useCallback(() => {
    const serverId = activeServerRef.current;
    const channelId = activeChannelRef.current;
    if (serverId && channelId) {
      setLastChannelId(serverId, channelId);
    }
  }, []);

  const setViewHome = useCallback(() => {
    persistActiveServerChannel();
    setViewMode("home");
    setActiveServerId(null);
    setActiveChannelId(null);
    setActiveDmThreadId(null);
    setActiveGroupChatId(null);
  }, [persistActiveServerChannel]);

  const setViewDiscover = useCallback(() => {
    persistActiveServerChannel();
    setViewMode("discover");
    setActiveServerId(null);
    setActiveChannelId(null);
    setActiveDmThreadId(null);
    setActiveGroupChatId(null);
  }, [persistActiveServerChannel]);

  const setViewNotes = useCallback(async () => {
    persistActiveServerChannel();
    setViewMode("notes");
    setActiveServerId(null);
    setActiveChannelId(null);
    setActiveDmThreadId(null);
    setActiveGroupChatId(null);
    if (userId) await loadNotes(userId);
  }, [persistActiveServerChannel, userId, loadNotes]);

  const selectServer = useCallback(async (serverId: string) => {
    markActivity();
    persistActiveServerChannel();
    setViewMode("space");
    setActiveServerId(serverId);
    setActiveDmThreadId(null);
    setActiveGroupChatId(null);
    clearServerIndicator(serverId);
    const channelRows = await loadServerDetails(serverId);
    const savedId = getLastChannelId(serverId);
    const saved = savedId ? channelRows.find((c) => c.id === savedId) : null;
    const target = saved ?? channelRows.find((c) => c.type === "text") ?? channelRows[0];
    if (target) {
      setActiveChannelId(target.id);

      setMessages([]);
      setMessagesLoading(true);
      setChannelHasMore(false);
      await loadMessages(target.id);
    } else {
      setActiveChannelId(null);
    }
  }, [loadServerDetails, loadMessages, clearServerIndicator, persistActiveServerChannel, markActivity]);

  const selectChannel = useCallback((channelId: string) => {
    markActivity();

    activeChannelRef.current = channelId;
    setActiveChannelId(channelId);
    setActiveDmThreadId(null);
    setActiveGroupChatId(null);

    setMessages([]);
    setMessagesLoading(true);
    setChannelHasMore(false);
    if (viewMode !== "space") setViewMode("space");
    const channel = channelsRef.current.find((c) => c.id === channelId);
    if (channel) {
      clearServerIndicator(channel.server_id);
      setLastChannelId(channel.server_id, channelId);
    }
    setChannelUnreadMap((prev) => {
      if (!prev.has(channelId)) return prev;
      const next = new Map(prev);
      next.delete(channelId);
      return next;
    });

    setChannelMentionMap((prev) => {
      if (!prev.has(channelId)) return prev;
      const next = new Map(prev);
      next.delete(channelId);
      return next;
    });
  }, [viewMode, clearServerIndicator, markActivity]);

  const selectDmThread = useCallback(async (threadId: string) => {
    markActivity();
    persistActiveServerChannel();
    setViewMode("dm");
    setActiveDmThreadId(threadId);
    activeDmRef.current = threadId;
    setActiveGroupChatId(null);
    activeGroupRef.current = null;
    setActiveChannelId(null);

    setDmMessages([]);
    setDmHasMore(false);
    setDmLoading(true);
    clearDmUnread(threadId);

    void markDmReadNow(threadId);
    await loadDmMessages(threadId);
  }, [loadDmMessages, clearDmUnread, markDmReadNow, persistActiveServerChannel, markActivity]);

  const selectGroupChat = useCallback(async (groupId: string) => {
    markActivity();
    persistActiveServerChannel();
    setViewMode("group");
    setActiveGroupChatId(groupId);
    activeGroupRef.current = groupId;
    setActiveDmThreadId(null);
    activeDmRef.current = null;
    setActiveChannelId(null);
    setGroupMessages([]);
    setGroupHasMore(false);
    setGroupLoading(true);
    clearGroupUnread(groupId);
    void getSupabaseClient().rpc("mark_group_read", { p_group_id: groupId });
    await loadGroupMessages(groupId);
  }, [loadGroupMessages, clearGroupUnread, persistActiveServerChannel, markActivity]);

  const routeToNotification = useCallback(async (link: string | null, at?: string | null) => {
    const target = parseNotificationLink(link);
    if (!target) return false;
    if (target.kind === "dm") {
      // The thread may reference a conversation that never loaded (or was
      // deleted): refresh once, and stay put instead of opening a blank
      // pane with a stuck spinner.
      if (!dmThreadsRef.current.some((t) => t.id === target.threadId)) {
        if (!userId) return false;
        await loadDmThreads(userId);
        if (!dmThreadsRef.current.some((t) => t.id === target.threadId)) return false;
      }
      await selectDmThread(target.threadId);
      requestUnreadJump("dm", target.threadId, at);
      return true;
    }
    if (target.kind === "group") {
      if (!groupChatsRef.current.some((g) => g.id === target.groupId)) {
        if (!userId) return false;
        await loadGroupChats(userId);
        if (!groupChatsRef.current.some((g) => g.id === target.groupId)) return false;
      }
      await selectGroupChat(target.groupId);
      requestUnreadJump("group", target.groupId, at);
      return true;
    }
    if (target.kind === "call") {

      return false;
    }
    let channel = channelsRef.current.find((c) => c.id === target.channelId);
    if (!channel) {
      // Maybe a space whose details never loaded: discover its server and
      // load that space first. Deleted or inaccessible → stay put.
      const { data } = await getSupabaseClient()
        .from("channels")
        .select("id, server_id")
        .eq("id", target.channelId)
        .maybeSingle();
      if (!data) return false;
      const serverId = (data as { server_id: string }).server_id;
      const rows = await loadServerDetails(serverId);
      if (!rows.some((c) => c.id === target.channelId)) return false;
      await selectServer(serverId);
      // Prefer the rows we just fetched over channelsRef: the ref only
      // syncs on re-render, which may not have committed yet when this
      // continuation runs (batched updates), causing a false miss.
      channel = rows.find((c) => c.id === target.channelId)
        ?? channelsRef.current.find((c) => c.id === target.channelId)
        ?? undefined;
      if (!channel) return false;
    } else if (channel.server_id !== activeServerRef.current) {
      await selectServer(channel.server_id);
    }
    selectChannel(target.channelId);
    requestUnreadJump("channel", target.channelId, at);
    return true;
  }, [userId, loadDmThreads, loadGroupChats, loadServerDetails, selectDmThread, selectGroupChat, selectServer, selectChannel]);

  const createGroupChat = useCallback(async (name: string, memberIds: string[]) => {
    if (!userId) return "Not signed in";
    if (hasRestriction("create_groups")) return "Your account is restricted from creating group chats.";
    const { data: id, error } = await getSupabaseClient().rpc("create_group_chat", {
      p_name: name,
      p_member_ids: memberIds,
    });
    if (error) return mapGroupChatError(error.message);
    await loadGroupChats(userId);
    await selectGroupChat(id as string);
    return null;
  }, [userId, loadGroupChats, selectGroupChat]);

  const leaveGroupChat = useCallback(async (groupId: string) => {
    if (!userId) return "Not signed in";
    const { error } = await getSupabaseClient().rpc("leave_group_chat", { p_group_id: groupId });
    if (error) return error.message;
    if (activeGroupChatId === groupId) {
      setActiveGroupChatId(null);
      setGroupMessages([]);
      setViewMode("home");
    }
    await loadGroupChats(userId);
    return null;
  }, [userId, activeGroupChatId, loadGroupChats]);

  const inviteToGroup = useCallback(async (groupId: string, memberIds: string[]) => {
    if (!userId) return "Not signed in";
    const { error } = await getSupabaseClient().rpc("add_group_members", {
      p_group_id: groupId,
      p_member_ids: memberIds,
    });
    if (error) return error.message;
    await loadGroupChats(userId);
    return null;
  }, [userId, loadGroupChats]);

  const renameGroupChat = useCallback(async (groupId: string, name: string) => {
    if (!userId) return "Not signed in";
    const { error } = await getSupabaseClient().rpc("rename_group_chat", {
      p_group_id: groupId,
      p_name: name.trim(),
    });
    if (error) return error.message;
    await loadGroupChats(userId);
    return null;
  }, [userId, loadGroupChats]);

  const deleteGroupMessage = useCallback(async (messageId: string) => {
    setGroupMessages((prev) => prev.filter((m) => m.id !== messageId));
    const { error } = await getSupabaseClient().from("group_messages").delete().eq("id", messageId);
    if (error && activeGroupChatId) await loadGroupMessages(activeGroupChatId);
  }, [activeGroupChatId, loadGroupMessages]);

  const openDmWithFriend = useCallback(async (friendId: string) => {
    if (!userId) return;
    if (friendId === tetherProfile?.id) return;
    const token = ++dmOpenTokenRef.current;
    const supabase = getSupabaseClient();
    let { data, error } = await supabase.rpc("get_or_create_dm_thread", { p_friend_id: friendId });

    if (error && /not authenticated|jwt/i.test(error.message)) {
      const result = await refreshSessionOnce();
      if ("session" in result && result.session) {
        ({ data, error } = await supabase.rpc("get_or_create_dm_thread", { p_friend_id: friendId }));
      }
    }

    if (error) {
      console.error("Could not open DM thread:", error.message);
      return;
    }
    const threadId = data as string;

    if (token !== dmOpenTokenRef.current) return;

    let friendProfile = friends.find((f) => f.id === friendId);
    if (!friendProfile) {
      const { data: fp } = await supabase.from("profiles").select("*").eq("id", friendId).maybeSingle();
      friendProfile = fp as Profile | undefined;
    }

    if (friendProfile) {
      const userA = userId < friendId ? userId : friendId;
      const userB = userId < friendId ? friendId : userId;
      setDmThreads((prev) => {
        const existing = prev.find((t) => t.id === threadId);
        if (existing) {
          return prev.map((t) => (t.id === threadId ? { ...t, friend: friendProfile! } : t));
        }
        return [
          ...prev,
          {
            id: threadId,
            user_a: userA,
            user_b: userB,
            created_at: new Date().toISOString(),
            friend: friendProfile!,
          },
        ];
      });
    }

    await selectDmThread(threadId);
    void loadDmThreads(userId);
  }, [userId, friends, selectDmThread, loadDmThreads, tetherProfile]);

  const sendInviteToFriend = useCallback(async (friendId: string, inviteUrl: string, serverName: string) => {
    if (!userId || !profile) return "Not signed in";
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc("get_or_create_dm_thread", { p_friend_id: friendId });
    if (error) return error.message;
    const threadId = data as string;
    const content = `You're invited to join **${serverName}**!\n${inviteUrl}`;
    const { error: insertError } = await supabase.from("dm_messages").insert({
      thread_id: threadId,
      author_id: userId,
      content: normalizeMessageContent(content),
      mentions: [],
    });
    if (insertError) return insertError.message;
    bumpDmThreadActivity(threadId, new Date().toISOString());
    void loadDmThreads(userId);
    return null;
  }, [userId, profile, bumpDmThreadActivity, loadDmThreads]);

  const sendFriendRequest = useCallback(async (username: string) => {
    if (!userId) return "Not signed in";
    if (hasRestriction("send_friend_requests")) return "Your account is restricted from sending friend requests.";
    const normalized = username.trim().toLowerCase();
    if (!normalized) return "Enter a username";

    const supabase = getSupabaseClient();
    const { data: target, error: lookupError } = await supabase
      .from("profiles")
      .select("id, is_bot")
      .eq("username", normalized)
      .maybeSingle();

    if (lookupError) return lookupError.message;
    if (!target) return `No user found with username "${normalized}"`;
    if (target.id === userId) return "Cannot friend yourself";
    if (target.is_bot) return "Tether and other bots can't receive friend requests.";

    const { data: existingRows, error: existingError } = await supabase
      .from("friendships")
      .select("id, status, requester_id, addressee_id")
      .or(
        `and(requester_id.eq.${userId},addressee_id.eq.${target.id}),and(requester_id.eq.${target.id},addressee_id.eq.${userId})`,
      );

    if (existingError) return existingError.message;

    const existing = (existingRows ?? [])[0];
    if (existing) {
      if (existing.status === "accepted") return "You are already friends";
      if (existing.status === "pending") {
        if (existing.requester_id === target.id) {
          return "This user already sent you a friend request — check Pending to accept or decline";
        }
        return "Friend request already sent";
      }
      if (existing.status === "blocked") {
        if (existing.requester_id === userId) {
          return "You have blocked this user. Unblock them first to send a friend request.";
        }
        return "This user has blocked you. You cannot send a friend request.";
      }
    }

    const { error } = await supabase.from("friendships").insert({
      requester_id: userId,
      addressee_id: target.id,
    });
    if (error) {
      if (error.code === "23505") {
        const { data: conflict } = await supabase
          .from("friendships")
          .select("status, requester_id, addressee_id")
          .or(
            `and(requester_id.eq.${userId},addressee_id.eq.${target.id}),and(requester_id.eq.${target.id},addressee_id.eq.${userId})`,
          )
          .maybeSingle();
        if (conflict?.status === "blocked") {
          if (conflict.requester_id === userId) {
            return "You have blocked this user. Unblock them first to send a friend request.";
          }
          return "This user has blocked you. You cannot send a friend request.";
        }
        if (conflict?.status === "pending") {
          if (conflict.requester_id === target.id) {
            return "This user already sent you a friend request — check Pending to accept or decline";
          }
          return "Friend request already sent";
        }
        if (conflict?.status === "accepted") return "You are already friends";
        return "A friend request already exists with this user";
      }
      return error.message;
    }
    await loadFriendships(userId);
    return null;
  }, [userId, loadFriendships]);

  const respondFriendRequest = useCallback(async (id: string, accept: boolean) => {
    if (!userId) return;
    const supabase = getSupabaseClient();
    const pending = friendships.find((f) => f.id === id);
    if (accept) {
      await supabase.from("friendships").update({ status: "accepted" }).eq("id", id);
      if (pending) {
        const friendId = pending.requester_id === userId ? pending.addressee_id : pending.requester_id;
        bumpFriendActivity(friendId);
      }
    } else {
      await supabase.from("friendships").delete().eq("id", id);
    }
    await loadFriendships(userId);
  }, [userId, friendships, loadFriendships, bumpFriendActivity]);

  const removeFriend = useCallback(async (friendId: string) => {
    if (!userId) return;
    const supabase = getSupabaseClient();
    await supabase
      .from("friendships")
      .delete()
      .or(`and(requester_id.eq.${userId},addressee_id.eq.${friendId}),and(requester_id.eq.${friendId},addressee_id.eq.${userId})`);
    await loadFriendships(userId);
  }, [userId, loadFriendships]);

  const blockUser = useCallback(async (targetUserId: string) => {
    if (!userId) return "Not signed in";
    if (targetUserId === tetherProfile?.id) return "Tether can't be blocked.";
    const { error } = await getSupabaseClient().rpc("block_user", { p_user_id: targetUserId });
    if (error) return error.message;
    if (activeDmThreadId) {
      const thread = dmThreads.find((t) => t.id === activeDmThreadId);
      if (thread && thread.friend.id === targetUserId) {
        setActiveDmThreadId(null);
        setViewMode("home");
      }
    }
    await loadFriendships(userId);
    return null;
  }, [userId, tetherProfile, activeDmThreadId, dmThreads, loadFriendships]);

  const unblockUser = useCallback(async (targetUserId: string) => {
    if (!userId) return "Not signed in";
    const { error } = await getSupabaseClient().rpc("unblock_user", { p_user_id: targetUserId });
    if (error) return error.message;
    await loadFriendships(userId);
    return null;
  }, [userId, loadFriendships]);

  const createServer = useCallback(async (data: { name: string; iconUrl?: string; bannerUrl?: string; description?: string }) => {
    if (!userId) return "Not signed in";
    if (hasRestriction("join_servers")) return "Your account is restricted from creating or joining spaces.";
    await ensureProfile(userId, user?.email);
    const { data: id, error } = await getSupabaseClient().rpc("create_server", {
      p_name: data.name,
      p_icon_url: data.iconUrl ?? null,
      p_banner_url: data.bannerUrl ?? null,
      p_description: data.description ?? null,
    });
    if (error) return error.message;
    await loadServers(userId);
    await selectServer(id as string);
    return null;
  }, [userId, user?.email, ensureProfile, loadServers, selectServer]);

  const updateServer = useCallback(async (serverId: string, patch: Partial<Server>) => {
    const { error } = await getSupabaseClient().from("servers").update(patch).eq("id", serverId);
    if (error) return error.message;
    if (userId) await loadServers(userId);
    return null;
  }, [userId, loadServers]);

  const deleteServer = useCallback(async (serverId: string) => {
    const { error } = await getSupabaseClient().rpc("delete_server", { p_server_id: serverId });
    if (error) return error.message;
    if (userId) await loadServers(userId);
    setViewHome();
    return null;
  }, [userId, loadServers, setViewHome]);

  const leaveServer = useCallback(async (serverId: string) => {
    if (!userId) return "Not signed in";

    const owned = servers.find((s) => s.id === serverId)?.owner_id === userId;
    if (owned) {
      return "You created this space, so you can't leave it. Transfer ownership to someone else, or delete the space.";
    }
    const { error } = await getSupabaseClient().from("server_members").delete().eq("server_id", serverId).eq("user_id", userId);
    if (error) return error.message;
    await loadServers(userId);
    setViewHome();
    return null;
  }, [userId, servers, loadServers, setViewHome]);

  const joinServerByInvite = useCallback(async (code: string) => {
    if (!userId) return "Not signed in";
    if (hasRestriction("join_servers")) return "Your account is restricted from joining spaces.";
    await ensureProfile(userId, user?.email);
    const { data: id, error } = await getSupabaseClient().rpc("join_server_by_invite", { p_code: code });
    if (error) return error.message;
    await loadServers(userId);
    await selectServer(id as string);
    return null;
  }, [userId, user?.email, ensureProfile, loadServers, selectServer]);

  const joinServerById = useCallback(async (serverId: string) => {
    if (!userId) return "Not signed in";
    if (hasRestriction("join_servers")) return "Your account is restricted from joining spaces.";
    await ensureProfile(userId, user?.email);
    const { error } = await getSupabaseClient().rpc("join_server_by_id", { p_server_id: serverId });
    if (error) return error.message;
    await loadServers(userId);
    await selectServer(serverId);
    return null;
  }, [userId, user?.email, ensureProfile, loadServers, selectServer]);

  const kickMember = useCallback(async (targetUserId: string) => {
    if (!activeServerId) return "No space selected";
    const { error } = await getSupabaseClient().rpc("kick_server_member", {
      p_server_id: activeServerId,
      p_user_id: targetUserId,
    });
    if (error) return error.message;
    await loadServerDetails(activeServerId);
    return null;
  }, [activeServerId, loadServerDetails]);

  const banMember = useCallback(async (targetUserId: string, reason?: string) => {
    if (!activeServerId) return "No space selected";
    const { error } = await getSupabaseClient().rpc("ban_server_member", {
      p_server_id: activeServerId,
      p_user_id: targetUserId,
      p_reason: reason ?? null,
    });
    if (error) return error.message;
    await loadServerDetails(activeServerId);
    return null;
  }, [activeServerId, loadServerDetails]);

  const unbanMember = useCallback(async (targetUserId: string) => {
    if (!activeServerId) return "No space selected";
    const { error } = await getSupabaseClient().rpc("unban_server_member", {
      p_server_id: activeServerId,
      p_user_id: targetUserId,
    });
    if (error) return error.message;
    await loadServerBans(activeServerId);
    return null;
  }, [activeServerId]);

  const timeoutMember = useCallback(async (targetUserId: string, seconds: number, reason?: string) => {
    if (!activeServerId) return "No space selected";
    const { error } = await getSupabaseClient().rpc("timeout_server_member", {
      p_server_id: activeServerId,
      p_user_id: targetUserId,
      p_seconds: Math.floor(seconds),
      p_reason: reason ?? "",
    });
    if (error) return error.message;
    await loadServerTimeouts(activeServerId);
    return null;
  }, [activeServerId]);

  const removeMemberTimeout = useCallback(async (targetUserId: string) => {
    if (!activeServerId) return "No space selected";
    const { error } = await getSupabaseClient().rpc("remove_timeout", {
      p_server_id: activeServerId,
      p_user_id: targetUserId,
    });
    if (error) return error.message;
    await loadServerTimeouts(activeServerId);
    return null;
  }, [activeServerId]);

  const loadServerTimeouts = useCallback(async (serverId: string) => {
    const now = new Date().toISOString();
    const { data } = await getSupabaseClient()
      .from("server_timeouts")
      .select("*")
      .eq("server_id", serverId)
      .gt("expires_at", now);
    setServerTimeouts((data as ServerTimeout[]) ?? []);
  }, []);

  const loadServerBans = useCallback(async (serverId: string) => {
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from("server_bans")
      .select("server_id, user_id, banned_by, reason, created_at")
      .eq("server_id", serverId);
    const rows = (data ?? []) as Omit<ServerBan, "profile">[];
    if (!rows.length) {
      setServerBans([]);
      return;
    }
    const profiles = await fetchProfilesByIds(supabase, rows.map((r) => r.user_id));
    setServerBans(rows.map((r) => ({ ...r, profile: profiles.get(r.user_id) })));
  }, []);

  const removeGroupMember = useCallback(async (groupId: string, targetUserId: string) => {
    const { error } = await getSupabaseClient().rpc("remove_group_member", {
      p_group_id: groupId,
      p_user_id: targetUserId,
    });
    if (error) return error.message;
    return null;
  }, []);

  const createFolder = useCallback(async (name: string, color: string) => {
    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return "Not signed in";
    const { data, error } = await supabase.from("server_folders").insert({
      user_id: user.id,
      name: name.trim().slice(0, 32) || "Folder",
      color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#5865f2",
      position: serverFolders.length,
    }).select("id").single();
    if (error) return error.message;
    await loadServerOrganization();
    return (data as { id: string } | null)?.id ?? null;
  }, [serverFolders.length, loadServerOrganization]);

  const renameFolder = useCallback(async (folderId: string, name: string) => {
    const trimmed = name.trim().slice(0, 32);
    if (!trimmed) return "Name cannot be empty";
    const { error } = await getSupabaseClient().from("server_folders")
      .update({ name: trimmed }).eq("id", folderId);
    if (error) return error.message;
    setServerFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, name: trimmed } : f)));
    return null;
  }, []);

  const setFolderColor = useCallback(async (folderId: string, color: string) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) return "Invalid color";
    const { error } = await getSupabaseClient().from("server_folders")
      .update({ color }).eq("id", folderId);
    if (error) return error.message;
    setServerFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, color } : f)));
    return null;
  }, []);

  const deleteFolder = useCallback(async (folderId: string) => {
    const { error } = await getSupabaseClient().from("server_folders").delete().eq("id", folderId);
    if (error) return error.message;
    await loadServerOrganization();
    return null;
  }, [loadServerOrganization]);

  const reorderFolders = useCallback(async (orderedIds: string[]) => {
    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return "Not signed in";
    const prev = serverFolders;
    setServerFolders((list) => {
      const order = new Map(orderedIds.map((id, i) => [id, i]));
      return [...list].sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999))
        .map((f, i) => ({ ...f, position: i }));
    });
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await supabase.from("server_folders")
        .update({ position: i }).eq("id", orderedIds[i]).eq("user_id", user.id);
      if (error) {
        setServerFolders(prev);
        return error.message;
      }
    }
    return null;
  }, [serverFolders]);

  const setServerSlot = useCallback(async (serverId: string, position: number, folderId: string | null) => {
    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return "Not signed in";
    const { error } = await supabase.from("server_list_state").upsert({
      user_id: user.id,
      server_id: serverId,
      position,
      folder_id: folderId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,server_id" });
    if (error) return error.message;
    setServerListState((prev) => {
      const next = prev.filter((s) => s.server_id !== serverId);
      next.push({ user_id: user.id, server_id: serverId, position, folder_id: folderId, updated_at: new Date().toISOString() });
      return next;
    });
    return null;
  }, []);

  const reorderServers = useCallback(async (slots: { server_id: string; position: number; folder_id: string | null }[]) => {
    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return "Not signed in";
    const stamped = new Date().toISOString();
    const { error } = await supabase.from("server_list_state").upsert(
      slots.map((s) => ({ user_id: user.id, ...s, updated_at: stamped })),
      { onConflict: "user_id,server_id" },
    );
    if (error) return error.message;
    setServerListState((prev) => {
      const ids = new Set(slots.map((s) => s.server_id));
      return [...prev.filter((s) => !ids.has(s.server_id)), ...slots.map((s) => ({ user_id: user.id, ...s, updated_at: stamped }))];
    });
    return null;
  }, []);

  const loadMutuals = useCallback(async (targetUserId: string) => {
    const supabase = getSupabaseClient();
    const [serversRes, friendsRes] = await Promise.all([
      supabase.rpc("mutual_server_ids", { p_user_id: targetUserId }),
      supabase.rpc("mutual_friend_ids", { p_user_id: targetUserId }),
    ]);
    return {
      serverIds: (serversRes.data as string[] | null) ?? [],
      friendIds: (friendsRes.data as string[] | null) ?? [],
    };
  }, []);

  const createRole = useCallback(async (data: { name: string; color: string; permissions?: ServerRole["permissions"] }) => {
    if (!activeServerId) return "No space selected";
    const { error } = await getSupabaseClient().from("server_roles").insert({
      server_id: activeServerId,
      name: data.name.trim(),
      color: data.color,
      position: serverRoles.length,
      ...(data.permissions ? { permissions: data.permissions } : {}),
    });
    if (error) return error.message;
    await loadServerDetails(activeServerId);
    return null;
  }, [activeServerId, serverRoles.length, loadServerDetails]);

  const updateRole = useCallback(async (
    roleId: string,
    patch: Partial<Pick<ServerRole, "name" | "color" | "permissions" | "gradient_to" | "gradient_animated">>,
  ) => {
    if (!activeServerId) return "No space selected";
    const update: Record<string, unknown> = {};
    if (patch.name !== undefined) update.name = patch.name.trim();
    if (patch.color !== undefined) update.color = patch.color;
    if (patch.gradient_to !== undefined) update.gradient_to = patch.gradient_to;
    if (patch.gradient_animated !== undefined) update.gradient_animated = patch.gradient_animated;
    if (patch.permissions !== undefined) update.permissions = patch.permissions;
    const { error } = await getSupabaseClient()
      .from("server_roles")
      .update(update)
      .eq("id", roleId)
      .eq("server_id", activeServerId);
    if (error) return error.message;
    await loadServerDetails(activeServerId);
    return null;
  }, [activeServerId, loadServerDetails]);

  const setMemberRoles = useCallback(async (targetUserId: string, roleIds: string[]) => {
    if (!activeServerId) return "No space selected";
    const { error } = await getSupabaseClient().rpc("set_member_roles", {
      p_server_id: activeServerId,
      p_user_id: targetUserId,
      p_role_ids: roleIds,
    });
    if (error) return error.message;
    await loadServerDetails(activeServerId);
    return null;
  }, [activeServerId, loadServerDetails]);

  const hasServerPermission = useCallback(
    (permission: ServerPermissionKey) => serverPermissions[permission],
    [serverPermissions],
  );

  const createChannel = useCallback(async (data: { name: string; type?: ChannelType; categoryId?: string | null }) => {
    if (!activeServerId) return "No space selected";
    const { data: id, error } = await getSupabaseClient().rpc("create_channel", {
      p_server_id: activeServerId,
      p_name: data.name.trim(),
      p_type: data.type ?? "text",
      p_category_id: data.categoryId ?? null,
    });
    if (error) return error.message;
    await loadServerDetails(activeServerId);
    if (typeof id === "string") selectChannel(id);
    return null;
  }, [activeServerId, loadServerDetails, selectChannel]);

  const setChannelReadOnly = useCallback(async (channelId: string, readOnly: boolean) => {
    if (!activeServerId) return "No space selected";
    const { error } = await getSupabaseClient()
      .from("channels")
      .update({ read_only: readOnly })
      .eq("id", channelId);
    if (error) return error.message;
    await loadServerDetails(activeServerId);
    return null;
  }, [activeServerId, loadServerDetails]);

  const renameChannel = useCallback(async (channelId: string, name: string) => {
    if (!activeServerId) return "No space selected";
    const { error } = await getSupabaseClient().rpc("rename_channel", {
      p_channel_id: channelId,
      p_name: name.trim(),
    });
    if (error) return error.message;
    await loadServerDetails(activeServerId);
    return null;
  }, [activeServerId, loadServerDetails]);

  const deleteChannel = useCallback(async (channelId: string) => {
    if (!activeServerId) return "No space selected";
    const { error } = await getSupabaseClient().rpc("delete_channel", {
      p_channel_id: channelId,
    });
    if (error) return error.message;
    if (activeChannelId === channelId) setActiveChannelId(null);
    await loadServerDetails(activeServerId);
    return null;
  }, [activeServerId, activeChannelId, loadServerDetails]);

  const createCategory = useCallback(async (name: string) => {
    if (!activeServerId) return "No space selected";
    const { data: id, error } = await getSupabaseClient().rpc("create_category", {
      p_server_id: activeServerId,
      p_name: name.trim(),
    });
    if (error) return error.message;
    await loadServerDetails(activeServerId);
    return typeof id === "string" ? null : "Failed to create category";
  }, [activeServerId, loadServerDetails]);

  const renameCategory = useCallback(async (categoryId: string, name: string) => {
    if (!activeServerId) return "No space selected";
    const { error } = await getSupabaseClient().rpc("rename_category", {
      p_category_id: categoryId,
      p_name: name.trim(),
    });
    if (error) return error.message;
    await loadServerDetails(activeServerId);
    return null;
  }, [activeServerId, loadServerDetails]);

  const deleteCategory = useCallback(async (categoryId: string) => {
    if (!activeServerId) return "No space selected";
    const { error } = await getSupabaseClient().rpc("delete_category", {
      p_category_id: categoryId,
    });
    if (error) return error.message;
    await loadServerDetails(activeServerId);
    return null;
  }, [activeServerId, loadServerDetails]);

  const moveChannel = useCallback(async (channelId: string, categoryId: string | null, index: number) => {
    if (!activeServerId) return "No space selected";
    const { error } = await getSupabaseClient().rpc("move_channel", {
      p_channel_id: channelId,
      p_category_id: categoryId,
      p_index: index,
    });
    if (error) return error.message;
    await loadServerDetails(activeServerId);
    return null;
  }, [activeServerId, loadServerDetails]);

  const moveCategory = useCallback(async (categoryId: string, index: number) => {
    if (!activeServerId) return "No space selected";
    const { error } = await getSupabaseClient().rpc("move_category", {
      p_category_id: categoryId,
      p_index: index,
    });
    if (error) return error.message;
    await loadServerDetails(activeServerId);
    return null;
  }, [activeServerId, loadServerDetails]);

  const deleteRole = useCallback(async (roleId: string) => {
    if (!activeServerId) return "No space selected";
    const { error } = await getSupabaseClient().rpc("delete_server_role", {
      p_role_id: roleId,
    });
    if (error) return error.message;
    await loadServerDetails(activeServerId);
    return null;
  }, [activeServerId, loadServerDetails]);

  const moveRole = useCallback(async (roleId: string, position: number) => {
    if (!activeServerId) return "No space selected";
    const { error } = await getSupabaseClient().rpc("move_role", {
      p_role_id: roleId,
      p_new_position: position,
    });
    if (error) return error.message;
    await loadServerDetails(activeServerId);
    return null;
  }, [activeServerId, loadServerDetails]);

  const platformBanUser = useCallback(async (opts: { username?: string; userId?: string; password: string; reason?: string }) => {
    const { data: { session: s } } = await getSupabaseClient().auth.getSession();
    if (!s) return "Not signed in";
    try {
      const res = await apiFetch("/api/moderation/platform-ban", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.access_token}` },
        body: JSON.stringify({ action: "ban", ...opts }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) return json.error ?? "Failed to ban user.";
      return null;
    } catch {
      return "Failed to reach moderation service.";
    }
  }, []);

  const platformUnbanUser = useCallback(async (opts: { userId: string; password: string }) => {
    const { data: { session: s } } = await getSupabaseClient().auth.getSession();
    if (!s) return "Not signed in";
    try {
      const res = await apiFetch("/api/moderation/platform-ban", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.access_token}` },
        body: JSON.stringify({ action: "unban", ...opts }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) return json.error ?? "Failed to unban user.";
      return null;
    } catch {
      return "Failed to reach moderation service.";
    }
  }, []);

  const getMemberColor = useCallback(
    (member: ServerMember) => {

      const roleIds = member.role_ids && member.role_ids.length > 0
        ? member.role_ids
        : member.role_id
          ? [member.role_id]
          : [];
      let best: ServerRole | null = null;
      for (const rid of roleIds) {
        const role = serverRoles.find((r) => r.id === rid);
        if (role?.color && (!best || role.position > best.position)) best = role;
      }
      return best?.color ?? null;
    },
    [serverRoles],
  );

  // Tether: when an Aero user's message mentions @tether, fire the ask after
  // the message is saved. Client-side gates are cosmetic cost savers only —
  // the route re-checks plan, mention, and ownership with the service role.
  const fireTetherAsk = useCallback((messageId: string, surface: TetherSurface, content: string) => {
    if (!mentionsTether(content)) return;
    if (subscriptionPlan !== "aero") return;
    void askTether(messageId, surface);
  }, [subscriptionPlan]);

  const sendChannelMessage = useCallback(async (content: string, options: MessageSendOptions = {}) => {
    if (!userId || !activeChannelId || !profile) return "No channel selected";
    if (hasRestriction("send_messages")) return "Your account is restricted from sending messages.";
    markActivity();
    const { attachment, replyToId, pendingFile, pendingFiles, maxUploadBytes } = options;
    const normalized = normalizeMessageContent(content);
    if (!normalized && !attachment && !pendingFile && !pendingFiles?.length) return "Empty message";
    const wordErr = messageCharLimitError(normalized, maxMessageCharsRef.current);
    if (wordErr) return wordErr;
    if (userId) {
      const pingErr = checkMentionSend(userId, parseMentions(normalized, members.map((m) => m.profile), userId), normalized);
      if (pingErr) return pingErr;
    }

    const tempId = `opt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    // One message carries the whole set; `pendingFile` is the single-file
    // form the GIF and poll callers still use.
    const files = (pendingFiles?.length ? pendingFiles : pendingFile ? [pendingFile] : [])
      .slice(0, MAX_ATTACHMENTS);

    let blobUrl: string | null = null;
    let attUrl = attachment?.url ?? null;
    let attType = attachment?.type ?? null;
    let attName = attachment?.name ?? null;
    let attSize = attachment?.size ?? null;
    let attKey = attachment?.key ?? null;

    // Local previews so the grid appears immediately; revoked once the real
    // URLs come back.
    const localUrls = files.map((f) => URL.createObjectURL(f));
    let optimisticAttachments: StoredAttachment[] = files.map((f, i) => ({
      url: localUrls[i],
      type: attachmentKind(f),
      name: f.name,
      size: f.size,
    }));
    if (files.length > 0) {
      blobUrl = localUrls[0];
      attUrl = localUrls[0];
      attType = attachmentKind(files[0]);
      attName = files[0].name;
      attSize = files[0].size;
    } else if (attachment) {
      optimisticAttachments = [{
        url: attachment.url,
        type: (attachment.type as StoredAttachment["type"]) ?? "file",
        name: attachment.name ?? null,
        size: attachment.size ?? null,
      }];
    }

    const optimistic: Message & { author: Profile } & { uploadProgress?: number } = {
      id: tempId,
      channel_id: activeChannelId,
      author_id: userId,
      content: normalized,
      attachment_url: attUrl,
      attachment_type: attType,
      attachment_key: attKey,
      attachment_name: attName,
      attachment_size: attSize,
      attachments: optimisticAttachments,
      reply_to_id: replyToId ?? null,
      mentions: parseMentions(normalized, members.map((m) => m.profile), userId),
      created_at: new Date().toISOString(),
      edited_at: null,
      author: profile,
      sending: true,
      uploadProgress: files.length > 0 ? 0 : undefined,
      display_id: 0,
    };
    setMessages((prev) => {
      const next = [...prev, optimistic];
      const { messages: windowed, trimmed } = trimToLatestWindow(next);
      if (trimmed) setChannelHasMore(true);
      return windowed;
    });

    if (files.length > 0) {
      try {
        const uploaded = await uploadAttachments(files, {
          maxUploadBytes,
          onProgress: (percent) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempId ? { ...m, uploadProgress: percent } : m,
              ),
            );
          },
        });
        optimisticAttachments = uploaded;
        const legacy = legacyColumns(uploaded);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId
              ? { ...m, ...legacy, attachments: uploaded, uploadProgress: undefined }
              : m,
          ),
        );
        attUrl = legacy.attachment_url;
        attKey = legacy.attachment_key;
        attType = legacy.attachment_type;
        attName = legacy.attachment_name;
        attSize = legacy.attachment_size;
        localUrls.forEach((u) => URL.revokeObjectURL(u));
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        localUrls.forEach((u) => URL.revokeObjectURL(u));
        return uploadErrorMessage(err);
      }
    }

    const mentionIds = parseMentions(normalized, members.map((m) => m.profile), userId);
    const { data, error } = await getSupabaseClient()
      .from("messages")
      .insert({
        channel_id: activeChannelId,
        author_id: userId,
        content: normalized,
        attachment_url: attUrl,
        attachment_type: attType,
        attachment_key: attKey,
        attachment_name: attName,
        attachment_size: attSize,
        attachments: optimisticAttachments.length > 0 ? optimisticAttachments : null,
        reply_to_id: replyToId ?? null,
        mentions: mentionIds,
      })
      .select("*, author:profiles(*)")
      .single();

    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      return mapMessageError(error.message);
    }
    const saved = data as Message & { author: Profile };
    saved.sending = false;
    setMessages((prev) => {
      const without = prev.filter((m) => m.id !== tempId && m.id !== saved.id && !(m.id.startsWith("opt-") && matchesOptimisticRow(m, saved)));
      const next = [...without, saved];
      const { messages: windowed, trimmed } = trimToLatestWindow(next);
      if (trimmed) setChannelHasMore(true);
      return windowed;
    });
    fireTetherAsk(saved.id, "server", normalized);
    return null;
  }, [userId, activeChannelId, profile, members, markActivity, fireTetherAsk]);

  const sendDmMessage = useCallback(async (content: string, options: MessageSendOptions = {}) => {
    if (!userId || !activeDmThreadId || !profile) return "No conversation selected";
    if (hasRestriction("send_messages")) return "Your account is restricted from sending messages.";
    markActivity();
    const { attachment, replyToId, pendingFile, pendingFiles, maxUploadBytes } = options;
    const normalized = normalizeMessageContent(content);
    if (!normalized && !attachment && !pendingFile && !pendingFiles?.length) return "Empty message";
    const wordErr = messageCharLimitError(normalized, maxMessageCharsRef.current);
    if (wordErr) return wordErr;

    const thread = dmThreads.find((t) => t.id === activeDmThreadId);
    const other = thread ? [thread.friend] : [];
    if (userId) {
      const pingErr = checkMentionSend(userId, parseMentions(normalized, other, userId), normalized);
      if (pingErr) return pingErr;
    }
    const tempId = `opt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    // One message carries the whole set; `pendingFile` is the single-file
    // form the GIF and poll callers still use.
    const files = (pendingFiles?.length ? pendingFiles : pendingFile ? [pendingFile] : [])
      .slice(0, MAX_ATTACHMENTS);

    let blobUrl: string | null = null;
    let attUrl = attachment?.url ?? null;
    let attType = attachment?.type ?? null;
    let attName = attachment?.name ?? null;
    let attSize = attachment?.size ?? null;
    let attKey = attachment?.key ?? null;

    // Local previews so the grid appears immediately; revoked once the real
    // URLs come back.
    const localUrls = files.map((f) => URL.createObjectURL(f));
    let optimisticAttachments: StoredAttachment[] = files.map((f, i) => ({
      url: localUrls[i],
      type: attachmentKind(f),
      name: f.name,
      size: f.size,
    }));
    if (files.length > 0) {
      blobUrl = localUrls[0];
      attUrl = localUrls[0];
      attType = attachmentKind(files[0]);
      attName = files[0].name;
      attSize = files[0].size;
    } else if (attachment) {
      optimisticAttachments = [{
        url: attachment.url,
        type: (attachment.type as StoredAttachment["type"]) ?? "file",
        name: attachment.name ?? null,
        size: attachment.size ?? null,
      }];
    }

    const optimistic: DmMessage & { author: Profile } & { uploadProgress?: number } = {
      id: tempId,
      thread_id: activeDmThreadId,
      author_id: userId,
      content: normalized,
      attachment_url: attUrl,
      attachment_type: attType,
      attachment_key: attKey,
      attachment_name: attName,
      attachment_size: attSize,
      reply_to_id: replyToId ?? null,
      mentions: parseMentions(normalized, other, userId),
      created_at: new Date().toISOString(),
      edited_at: null,
      author: profile,
      sending: true,
      uploadProgress: files.length > 0 ? 0 : undefined,
      display_id: 0,
    };
    setDmMessages((prev) => {
      const next = [...prev, optimistic];
      const { messages: windowed, trimmed } = trimToLatestWindow(next);
      if (trimmed) setDmHasMore(true);
      return windowed;
    });
    bumpDmThreadActivity(activeDmThreadId, optimistic.created_at);

    if (files.length > 0) {
      try {
        const uploaded = await uploadAttachments(files, {
          maxUploadBytes,
          onProgress: (percent) => {
            setDmMessages((prev) =>
              prev.map((m) =>
                m.id === tempId ? { ...m, uploadProgress: percent } : m,
              ),
            );
          },
        });
        optimisticAttachments = uploaded;
        const legacy = legacyColumns(uploaded);
        setDmMessages((prev) =>
          prev.map((m) =>
            m.id === tempId
              ? { ...m, ...legacy, attachments: uploaded, uploadProgress: undefined }
              : m,
          ),
        );
        attUrl = legacy.attachment_url;
        attKey = legacy.attachment_key;
        attType = legacy.attachment_type;
        attName = legacy.attachment_name;
        attSize = legacy.attachment_size;
        localUrls.forEach((u) => URL.revokeObjectURL(u));
      } catch (err) {
        setDmMessages((prev) => prev.filter((m) => m.id !== tempId));
        localUrls.forEach((u) => URL.revokeObjectURL(u));
        return uploadErrorMessage(err);
      }
    }

    const mentionIds = parseMentions(normalized, other, userId);
    const { data, error } = await getSupabaseClient()
      .from("dm_messages")
      .insert({
        thread_id: activeDmThreadId,
        author_id: userId,
        content: normalized,
        attachment_url: attUrl,
        attachment_type: attType,
        attachment_key: attKey,
        attachment_name: attName,
        attachment_size: attSize,
        attachments: optimisticAttachments.length > 0 ? optimisticAttachments : null,
        reply_to_id: replyToId ?? null,
        mentions: mentionIds,
      })
      .select("*, author:profiles(*)")
      .single();

    if (error) {
      setDmMessages((prev) => prev.filter((m) => m.id !== tempId));
      return mapMessageError(error.message);
    }
    const saved = data as DmMessage & { author: Profile };
    saved.sending = false;
    setDmMessages((prev) => {
      const without = prev.filter((m) => m.id !== tempId && m.id !== saved.id && !(m.id.startsWith("opt-") && matchesOptimisticRow(m, saved)));
      const next = [...without, saved];
      const { messages: windowed, trimmed } = trimToLatestWindow(next);
      if (trimmed) setDmHasMore(true);
      return windowed;
    });
    bumpDmThreadActivity(activeDmThreadId, saved.created_at);
    fireTetherAsk(saved.id, "dm", normalized);
    return null;
  }, [userId, activeDmThreadId, profile, dmThreads, bumpDmThreadActivity, markActivity, fireTetherAsk]);

  const sendGroupMessage = useCallback(async (content: string, options: MessageSendOptions = {}) => {
    if (!userId || !activeGroupChatId || !profile) return "No group selected";
    if (hasRestriction("send_messages")) return "Your account is restricted from sending messages.";
    markActivity();
    const { attachment, replyToId, pendingFile, pendingFiles, maxUploadBytes } = options;
    const normalized = normalizeMessageContent(content);
    if (!normalized && !attachment && !pendingFile && !pendingFiles?.length) return "Empty message";
    const wordErr = messageCharLimitError(normalized, maxMessageCharsRef.current);
    if (wordErr) return wordErr;

    const group = groupChats.find((g) => g.id === activeGroupChatId);
    if (userId) {
      const pingErr = checkMentionSend(userId, parseMentions(normalized, group?.members ?? [], userId), normalized);
      if (pingErr) return pingErr;
    }
    const tempId = `opt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    // One message carries the whole set; `pendingFile` is the single-file
    // form the GIF and poll callers still use.
    const files = (pendingFiles?.length ? pendingFiles : pendingFile ? [pendingFile] : [])
      .slice(0, MAX_ATTACHMENTS);

    let blobUrl: string | null = null;
    let attUrl = attachment?.url ?? null;
    let attType = attachment?.type ?? null;
    let attName = attachment?.name ?? null;
    let attSize = attachment?.size ?? null;
    let attKey = attachment?.key ?? null;

    // Local previews so the grid appears immediately; revoked once the real
    // URLs come back.
    const localUrls = files.map((f) => URL.createObjectURL(f));
    let optimisticAttachments: StoredAttachment[] = files.map((f, i) => ({
      url: localUrls[i],
      type: attachmentKind(f),
      name: f.name,
      size: f.size,
    }));
    if (files.length > 0) {
      blobUrl = localUrls[0];
      attUrl = localUrls[0];
      attType = attachmentKind(files[0]);
      attName = files[0].name;
      attSize = files[0].size;
    } else if (attachment) {
      optimisticAttachments = [{
        url: attachment.url,
        type: (attachment.type as StoredAttachment["type"]) ?? "file",
        name: attachment.name ?? null,
        size: attachment.size ?? null,
      }];
    }

    const optimistic: GroupMessage & { author: Profile } & { uploadProgress?: number } = {
      id: tempId,
      group_id: activeGroupChatId,
      author_id: userId,
      content: normalized,
      attachment_url: attUrl,
      attachment_type: attType,
      attachment_key: attKey,
      attachment_name: attName,
      attachment_size: attSize,
      reply_to_id: replyToId ?? null,
      mentions: parseMentions(normalized, group?.members ?? [], userId),
      created_at: new Date().toISOString(),
      edited_at: null,
      author: profile,
      sending: true,
      uploadProgress: files.length > 0 ? 0 : undefined,
      display_id: 0,
    };
    setGroupMessages((prev) => {
      const next = [...prev, optimistic];
      const { messages: windowed, trimmed } = trimToLatestWindow(next);
      if (trimmed) setGroupHasMore(true);
      return windowed;
    });

    if (files.length > 0) {
      try {
        const uploaded = await uploadAttachments(files, {
          maxUploadBytes,
          onProgress: (percent) => {
            setGroupMessages((prev) =>
              prev.map((m) =>
                m.id === tempId ? { ...m, uploadProgress: percent } : m,
              ),
            );
          },
        });
        optimisticAttachments = uploaded;
        const legacy = legacyColumns(uploaded);
        setGroupMessages((prev) =>
          prev.map((m) =>
            m.id === tempId
              ? { ...m, ...legacy, attachments: uploaded, uploadProgress: undefined }
              : m,
          ),
        );
        attUrl = legacy.attachment_url;
        attKey = legacy.attachment_key;
        attType = legacy.attachment_type;
        attName = legacy.attachment_name;
        attSize = legacy.attachment_size;
        localUrls.forEach((u) => URL.revokeObjectURL(u));
      } catch (err) {
        setGroupMessages((prev) => prev.filter((m) => m.id !== tempId));
        localUrls.forEach((u) => URL.revokeObjectURL(u));
        return uploadErrorMessage(err);
      }
    }

    const mentionIds = parseMentions(normalized, group?.members ?? [], userId);
    const { data, error } = await getSupabaseClient()
      .from("group_messages")
      .insert({
        group_id: activeGroupChatId,
        author_id: userId,
        content: normalized,
        attachment_url: attUrl,
        attachment_type: attType,
        attachment_key: attKey,
        attachment_name: attName,
        attachment_size: attSize,
        attachments: optimisticAttachments.length > 0 ? optimisticAttachments : null,
        reply_to_id: replyToId ?? null,
        mentions: mentionIds,
      })
      .select("*, author:profiles(*)")
      .single();

    if (error) {
      setGroupMessages((prev) => prev.filter((m) => m.id !== tempId));
      return mapGroupChatError(error.message);
    }
    const saved = data as GroupMessage & { author: Profile };
    saved.sending = false;
    setGroupMessages((prev) => {
      const without = prev.filter((m) => m.id !== tempId && m.id !== saved.id && !(m.id.startsWith("opt-") && matchesOptimisticRow(m, saved)));
      const next = [...without, saved];
      const { messages: windowed, trimmed } = trimToLatestWindow(next);
      if (trimmed) setGroupHasMore(true);
      return windowed;
    });
    fireTetherAsk(saved.id, "group", normalized);
    return null;
  }, [userId, activeGroupChatId, profile, groupChats, markActivity, fireTetherAsk]);

  const deleteMessage = useCallback(async (messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));

    const { data, error } = await getSupabaseClient()
      .from("messages")
      .delete()
      .eq("id", messageId)
      .select("id");
    if ((error || !data?.length) && activeChannelId) await loadMessages(activeChannelId);
  }, [activeChannelId, loadMessages]);

  const sendNote = useCallback(async (content: string, options: MessageSendOptions = {}) => {
    if (!userId) return "Not signed in";
    markActivity();
    const { attachment, replyToId, pendingFile, pendingFiles, maxUploadBytes } = options;
    const normalized = normalizeMessageContent(content);
    if (!normalized && !attachment && !pendingFile) return "Empty note";
    const charErr = messageCharLimitError(normalized, maxMessageCharsRef.current);
    if (charErr) return charErr;

    const tempId = `opt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    // One message carries the whole set; `pendingFile` is the single-file
    // form the GIF and poll callers still use.
    const files = (pendingFiles?.length ? pendingFiles : pendingFile ? [pendingFile] : [])
      .slice(0, MAX_ATTACHMENTS);

    let blobUrl: string | null = null;
    let attUrl = attachment?.url ?? null;
    let attType = attachment?.type ?? null;
    let attName = attachment?.name ?? null;
    let attSize = attachment?.size ?? null;
    let attKey = attachment?.key ?? null;

    // Local previews so the grid appears immediately; revoked once the real
    // URLs come back.
    const localUrls = files.map((f) => URL.createObjectURL(f));
    let optimisticAttachments: StoredAttachment[] = files.map((f, i) => ({
      url: localUrls[i],
      type: attachmentKind(f),
      name: f.name,
      size: f.size,
    }));
    if (files.length > 0) {
      blobUrl = localUrls[0];
      attUrl = localUrls[0];
      attType = attachmentKind(files[0]);
      attName = files[0].name;
      attSize = files[0].size;
    } else if (attachment) {
      optimisticAttachments = [{
        url: attachment.url,
        type: (attachment.type as StoredAttachment["type"]) ?? "file",
        name: attachment.name ?? null,
        size: attachment.size ?? null,
      }];
    }

    const optimistic: Note = {
      id: tempId,
      user_id: userId,
      content: normalized,
      attachment_url: attUrl,
      attachment_type: attType,
      attachment_key: attKey,
      attachment_name: attName,
      attachment_size: attSize,
      reply_to_id: replyToId ?? null,
      pinned: false,
      created_at: new Date().toISOString(),
      edited_at: null,
      sending: true,
      uploadProgress: files.length > 0 ? 0 : undefined,
    };
    setNotes((prev) => {
      const next = [...prev, optimistic];
      const { messages: windowed, trimmed } = trimToLatestWindow(next);
      if (trimmed) setNotesHasMore(true);
      return windowed;
    });

    if (files.length > 0) {
      try {
        const uploaded = await uploadAttachments(files, {
          maxUploadBytes,
          onProgress: (percent) => {
            setNotes((prev) =>
              prev.map((n) => (n.id === tempId ? { ...n, uploadProgress: percent } : n)),
            );
          },
        });
        // Notes hold a single attachment, so only the first is kept.
        const legacy = legacyColumns(uploaded);
        setNotes((prev) =>
          prev.map((n) =>
            n.id === tempId
              ? { ...n, ...legacy, uploadProgress: undefined }
              : n,
          ),
        );
        attUrl = legacy.attachment_url;
        attKey = legacy.attachment_key;
        attType = legacy.attachment_type;
        attName = legacy.attachment_name;
        attSize = legacy.attachment_size;
        localUrls.forEach((u) => URL.revokeObjectURL(u));
      } catch (err) {
        setNotes((prev) => prev.filter((n) => n.id !== tempId));
        localUrls.forEach((u) => URL.revokeObjectURL(u));
        return uploadErrorMessage(err);
      }
    }

    const { data, error } = await getSupabaseClient()
      .from("notes")
      .insert({
        user_id: userId,
        content: normalized,
        attachment_url: attUrl,
        attachment_type: attType,
        attachment_key: attKey,
        attachment_name: attName,
        attachment_size: attSize,
        reply_to_id: replyToId ?? null,
      })
      .select("*")
      .single();

    if (error) {
      setNotes((prev) => prev.filter((n) => n.id !== tempId));
      return error.message;
    }
    const saved = data as Note;
    setNotes((prev) => {
      const without = prev.filter((n) => n.id !== tempId && n.id !== saved.id);
      const next = [...without, saved];
      const { messages: windowed, trimmed } = trimToLatestWindow(next);
      if (trimmed) setNotesHasMore(true);
      return windowed;
    });
    return null;
  }, [userId, markActivity]);

  const editNote = useCallback(async (noteId: string, content: string) => {
    if (!userId) return "Not signed in";
    const normalized = normalizeMessageContent(content);
    const target = notes.find((n) => n.id === noteId);

    if (!normalized && !target?.attachment_url) return "Note cannot be empty";
    const editedAt = new Date().toISOString();
    setNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, content: normalized, edited_at: editedAt } : n)),
    );
    const { error } = await getSupabaseClient()
      .from("notes")
      .update({ content: normalized, edited_at: editedAt })
      .eq("id", noteId)
      .eq("user_id", userId);
    if (error) {
      await loadNotes(userId);
      return error.message;
    }
    return null;
  }, [userId, notes, loadNotes]);

  const deleteNote = useCallback(async (noteId: string) => {
    if (!userId) return;
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    const { error } = await getSupabaseClient()
      .from("notes")
      .delete()
      .eq("id", noteId)
      .eq("user_id", userId);
    if (error) await loadNotes(userId);
  }, [userId, loadNotes]);

  const toggleNotePinned = useCallback(async (noteId: string) => {
    if (!userId) return;
    const target = notes.find((n) => n.id === noteId);
    if (!target) return;
    const next = !target.pinned;
    setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, pinned: next } : n)));
    const { error } = await getSupabaseClient()
      .from("notes")
      .update({ pinned: next })
      .eq("id", noteId)
      .eq("user_id", userId);
    if (error) await loadNotes(userId);
  }, [userId, notes, loadNotes]);

  const loadPinnedMessages = useCallback(async (sourceType: PinnedSourceType, sourceId: string) => {
    if (!userId) return;
    const key = `${sourceType}:${sourceId}`;
    const { data } = await getSupabaseClient().rpc("get_pinned_messages", {
      p_source_type: sourceType,
      p_source_id: sourceId,
    });
    if (data) setPinnedBySource((prev) => ({ ...prev, [key]: data as PinnedMessage[] }));
  }, [userId]);

  const pinMessage = useCallback(
    async (
      sourceType: PinnedSourceType,
      sourceId: string,
      message: { id: string; author_id: string | null; content: string },
    ) => {
      if (!userId) return;
      await getSupabaseClient().rpc("pin_message", {
        p_source_type: sourceType,
        p_source_id: sourceId,
        p_message_id: message.id,
        p_content: message.content ?? "",
        p_author_id: message.author_id,
      });
      await loadPinnedMessages(sourceType, sourceId);
    },
    [userId, loadPinnedMessages],
  );

  const unpinMessage = useCallback(
    async (sourceType: PinnedSourceType, sourceId: string, messageId: string) => {
      if (!userId) return;
      await getSupabaseClient().rpc("unpin_message", {
        p_source_type: sourceType,
        p_source_id: sourceId,
        p_message_id: messageId,
      });
      await loadPinnedMessages(sourceType, sourceId);
    },
    [userId, loadPinnedMessages],
  );

  const deleteDmMessage = useCallback(async (messageId: string) => {
    setDmMessages((prev) => prev.filter((m) => m.id !== messageId));
    const { error } = await getSupabaseClient().from("dm_messages").delete().eq("id", messageId);
    if (error && activeDmThreadId) await loadDmMessages(activeDmThreadId);
  }, [activeDmThreadId, loadDmMessages]);

  const editChannelMessage = useCallback(async (messageId: string, content: string) => {
    if (!userId || !activeChannelId) return "Not signed in";
    const normalized = normalizeMessageContent(content);
    if (!normalized) return "Message cannot be empty";
    const editWordErr = messageCharLimitError(normalized, maxMessageCharsRef.current);
    if (editWordErr) return editWordErr;
    const editedAt = new Date().toISOString();
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, content: normalized, edited_at: editedAt } : m)),
    );
    const { error } = await getSupabaseClient()
      .from("messages")
      .update({ content: normalized, edited_at: editedAt })
      .eq("id", messageId)
      .eq("author_id", userId);
    if (error) {
      await loadMessages(activeChannelId);
      return error.message;
    }
    return null;
  }, [userId, activeChannelId, loadMessages]);

  const editDmMessage = useCallback(async (messageId: string, content: string) => {
    if (!userId || !activeDmThreadId) return "Not signed in";
    const normalized = normalizeMessageContent(content);
    if (!normalized) return "Message cannot be empty";
    const editWordErr = messageCharLimitError(normalized, maxMessageCharsRef.current);
    if (editWordErr) return editWordErr;
    const editedAt = new Date().toISOString();
    setDmMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, content: normalized, edited_at: editedAt } : m)),
    );
    const { error } = await getSupabaseClient()
      .from("dm_messages")
      .update({ content: normalized, edited_at: editedAt })
      .eq("id", messageId)
      .eq("author_id", userId);
    if (error) {
      await loadDmMessages(activeDmThreadId);
      return error.message;
    }
    return null;
  }, [userId, activeDmThreadId, loadDmMessages]);

  const editGroupMessage = useCallback(async (messageId: string, content: string) => {
    if (!userId || !activeGroupChatId) return "Not signed in";
    const normalized = normalizeMessageContent(content);
    if (!normalized) return "Message cannot be empty";
    const editWordErr = messageCharLimitError(normalized, maxMessageCharsRef.current);
    if (editWordErr) return editWordErr;
    const editedAt = new Date().toISOString();
    setGroupMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, content: normalized, edited_at: editedAt } : m)),
    );
    const { error } = await getSupabaseClient()
      .from("group_messages")
      .update({ content: normalized, edited_at: editedAt })
      .eq("id", messageId)
      .eq("author_id", userId);
    if (error) {
      await loadGroupMessages(activeGroupChatId);
      return error.message;
    }
    return null;
  }, [userId, activeGroupChatId, loadGroupMessages]);

  const toggleReaction = useCallback(async (context: MessageContext, messageId: string, emoji: string) => {
    if (!userId) return;
    const supabase = getSupabaseClient();
    const existing = messageReactions.find(
      (r) => r.context_type === context && r.message_id === messageId && r.user_id === userId && r.emoji === emoji,
    );
    if (existing) {
      setMessageReactions((prev) => prev.filter((r) => r.id !== existing.id));
      await supabase.from("message_reactions").delete().eq("id", existing.id);
      return;
    }
    const { data, error } = await supabase
      .from("message_reactions")
      .insert({ context_type: context, message_id: messageId, user_id: userId, emoji })
      .select("*")
      .single();
    if (!error && data) {
      setMessageReactions((prev) => [...prev, data as MessageReaction]);
    }
  }, [userId, messageReactions]);

  const markNotificationsRead = useCallback(async () => {
    if (!userId) return;
    await getSupabaseClient().from("notifications").update({ read: true }).eq("user_id", userId).eq("read", false);
    await loadNotifications(userId);
  }, [userId, loadNotifications]);

  const markNotificationsSeen = useCallback(async () => {
    if (!userId) return;
    const now = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => (n.seen_at ? n : { ...n, seen_at: now })),
    );
    await getSupabaseClient()
      .from("notifications")
      .update({ seen_at: now })
      .eq("user_id", userId)
      .is("seen_at", null);
    await loadNotifications(userId);
  }, [userId, loadNotifications]);

  const markNotificationRead = useCallback(async (id: string) => {
    if (!userId) return;
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    await getSupabaseClient().from("notifications").update({ read: true }).eq("id", id).eq("user_id", userId);
    await loadNotifications(userId);
  }, [userId, loadNotifications]);

  const loadVoicePresence = useCallback(async (channelId: string) => {
    const supabase = getSupabaseClient();
    const { data: rows } = await supabase
      .from("voice_presence_live")
      .select("*")
      .eq("channel_id", channelId);
    if (!rows?.length) {
      setVoicePresence([]);
      return;
    }
    const map = await fetchProfilesByIds(supabase, rows.map((r) => r.user_id));
    setVoicePresence(
      rows.map((r) => ({ ...r, profile: map.get(r.user_id)! })).filter((r) => r.profile),
    );
  }, []);

  const setMaxMessageChars = useCallback((n: number) => { maxMessageCharsRef.current = n; }, []);
  const setMaxBioLength = useCallback((n: number) => { maxBioLengthRef.current = n; }, []);

  const getChannelMentionCount = useCallback(
    (channelId: string) => channelMentionMap.get(channelId) ?? 0,
    [channelMentionMap],
  );

  const getChannelUnreadCount = useCallback(
    (channelId: string) => channelUnreadMap.get(channelId) ?? 0,
    [channelUnreadMap],
  );

  // Dock / taskbar / tab badge. Mentions are the things that addressed you by
  // name — a channel ping, any DM, any group message — and get a count. Plain
  // channel traffic is unread but not urgent, so it only lights the dot.
  //
  // `userId` gates it so a signed-out window does not inherit the last
  // session's count, and the cleanup clears the badge on unmount (closing the
  // last desktop window otherwise leaves a stale number on the dock icon).
  const mentionTotal = useMemo(() => {
    let total = 0;
    for (const n of channelMentionMap.values()) total += n;
    for (const entry of dmUnreadMap.values()) total += entry.count;
    for (const n of groupUnreadMap.values()) total += n;
    return total;
  }, [channelMentionMap, dmUnreadMap, groupUnreadMap]);

  const hasUnread = useMemo(() => {
    if (mentionTotal > 0) return true;
    if (serverIndicators.size > 0) return true;
    for (const n of channelUnreadMap.values()) if (n > 0) return true;
    return false;
  }, [mentionTotal, serverIndicators, channelUnreadMap]);

  useEffect(() => {
    if (!userId) {
      clearAppBadge();
      return;
    }
    setAppBadge({ mentions: mentionTotal, unread: hasUnread });
  }, [userId, mentionTotal, hasUnread]);

  useEffect(() => () => clearAppBadge(), []);

  const handleVoiceJoinedChannel = useCallback((channelId: string | null) => {
    markActivity();
    setVoiceJoinedChannelId(channelId);
  }, [markActivity]);

  const handleCallPhase = useCallback((phase: "idle" | "outgoing" | "incoming" | "active") => {
    markActivity();
    setCallPhase(phase);
  }, [markActivity]);

  const value: AppContextValue = {
    ready,
    hydrated,
    configured,
    session,
    user,
    profile,
    tetherProfile,
    subscriptionPlan,
    servers,
    categories,
    channels,
    members,
    serverRoles,
    messages,
    dmThreads: sortedDmThreads,
    dmMessages,
    notes,
    groupChats,
    groupMessages,
    messagesLoading,
    dmLoading,
    groupLoading,
    friendships,
    friends,
    pendingIncoming,
    pendingOutgoing,
    notifications,
    voicePresence,
    viewMode,
    activeServerId,
    activeChannelId,
    activeDmThreadId,
    activeGroupChatId,
    activeChannel,
    activeServer,
    micMuted,
    deafened,
    setMicMuted,
    setDeafened,
    signIn,
    signUp,
    requestPasswordReset,
    updatePassword,
    mfaRequired,
    refreshMfaStatus,
    signOut,
    refreshAll,
    savedSessions,
    switchAccount,
    removeSavedAccount,
    addingAccount,
    beginAddAccount,
    cancelAddAccount,
    updateProfile,
    setViewHome,

    setViewDiscover,
    setViewNotes,
    selectServer,
    selectChannel,
    selectDmThread,
    selectGroupChat,
    refreshGroupChats,
    createGroupChat,
    leaveGroupChat,
    inviteToGroup,
    renameGroupChat,
    deleteGroupMessage,
    groupCallCounts,
    openDmWithFriend,
    sendInviteToFriend,
    sendFriendRequest,
    respondFriendRequest,
    removeFriend,
    blockUser,
    unblockUser,
    blockedUserIds,
    isBlocked,
    isBlockedEitherWay,
    createServer,
    updateServer,
    deleteServer,
    leaveServer,
    joinServerByInvite,
    joinServerById,
    kickMember,
    banMember,
    unbanMember,
    timeoutMember,
    removeMemberTimeout,
    removeGroupMember,
    loadMutuals,
    serverTimeouts,
    serverBans,
    serverFolders,
    serverListState,
    loadServerOrganization,
    createFolder,
    renameFolder,
    setFolderColor,
    deleteFolder,
    reorderFolders,
    setServerSlot,
    reorderServers,
    createRole,
    updateRole,
    setMemberRoles,
    getMemberColor,
    createChannel,
    renameChannel,
    setChannelReadOnly,
    deleteChannel,
    createCategory,
    renameCategory,
    deleteCategory,
    moveChannel,
    moveCategory,
    deleteRole,
    moveRole,
    sendChannelMessage,
    sendDmMessage,
    sendGroupMessage,
    editChannelMessage,
    editDmMessage,
    editGroupMessage,
    toggleReaction,
    messageReactions,
    deleteMessage,
    deleteDmMessage,
    sendNote,
    editNote,
    deleteNote,
    toggleNotePinned,
    pinnedBySource,
    loadPinnedMessages,
    pinMessage,
    unpinMessage,
    markNotificationsRead,
    catalystCounts,
    myCatalysts,
    refreshCatalysts,
    allocateCatalyst,
    withdrawCatalyst,
    customEmojiMap,
    markNotificationsSeen,
    markNotificationRead,
    routeToNotification,
    loadVoicePresence,
    voiceJoinedChannelId,
    setVoiceJoinedChannelId: handleVoiceJoinedChannel,
    setCallPhase: handleCallPhase,
    setMaxMessageChars,
    setMaxBioLength,
    dmUnreads,
    dmListEntries,
    serverUnreadIds,
    getDmUnreadCount,
    clearDmUnread,
    channelUnreadMap,
    getChannelUnreadCount,
    getChannelMentionCount,
    groupUnreadMap,
    getGroupUnreadCount,
    clearGroupUnread,
    presenceMap,
    channelHasMore,
    dmHasMore,
    groupHasMore,
    notesHasMore,
    loadMoreChannelMessages,
    loadMoreDmMessages,
    loadMoreGroupMessages,
    loadMoreNotes,
    platformBan,
    restrictions,
    refreshRestrictions,
    refreshPlatformAccess,
    serverPermissions,
    hasServerPermission,
    channelEffects,
    platformBanUser,
    platformUnbanUser,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp requires AppProvider");
  return ctx;
}

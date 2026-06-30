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
import { getSupabaseClient, isSupabaseConfigured, resetSupabaseClient } from "@/lib/supabase/client";
import { isTauri } from "@/lib/platform";
import { notifyUser, alertIncomingDm, alertMention, setNotificationFocusState, parseNotificationLink, primeNotificationPermission } from "@/lib/notifications";
import { syncUserSettings } from "@/lib/user-settings";
import { getAuthRedirectUrl } from "@/lib/auth-redirect";
import { mapProfileError, mapGroupChatError, mapMessageError } from "@/lib/profileErrors";
import { messageCharLimitError, bioLengthError } from "@/lib/word-limit";
import { getMfaAssurance } from "@/lib/mfa";
import { mapAuthError, type SignUpResult } from "@/lib/authErrors";
import { uploadMedia } from "@/lib/media/uploadMedia";
import { getLastChannelId, setLastChannelId } from "@/lib/server-last-channel";
import { getCached, setCache } from "@/lib/app-cache";
import { parseMentions, normalizeMessageContent, displayName } from "@/lib/utils";
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
import type {
  AppNotification,
  Channel,
  ChannelCategory,
  DmMessage,
  DmThread,
  Friendship,
  GroupChatWithMembers,
  GroupMessage,
  Message,
  Profile,
  Server,
  ServerMember,
  ServerRole,
  UserStatus,
  ViewMode,
  VoicePresence,
} from "@/lib/supabase/types";

interface AppContextValue {
  ready: boolean;
  configured: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  servers: Server[];
  categories: ChannelCategory[];
  channels: Channel[];
  members: (ServerMember & { profile: Profile })[];
  serverRoles: ServerRole[];
  messages: (Message & { author: Profile })[];
  dmThreads: (DmThread & { friend: Profile })[];
  dmMessages: (DmMessage & { author: Profile })[];
  groupChats: GroupChatWithMembers[];
  groupMessages: (GroupMessage & { author: Profile })[];
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
  signUp: (email: string, password: string, username: string) => Promise<SignUpResult>;
  requestPasswordReset: (email: string) => Promise<string | null>;
  updatePassword: (password: string) => Promise<string | null>;
  mfaRequired: boolean;
  refreshMfaStatus: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshAll: () => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<string | null>;
  setViewHome: () => void;
  selectServer: (serverId: string) => Promise<void>;
  selectChannel: (channelId: string) => void;
  selectDmThread: (threadId: string) => Promise<void>;
  selectGroupChat: (groupId: string) => Promise<void>;
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
  kickMember: (userId: string) => Promise<string | null>;
  banMember: (userId: string, reason?: string) => Promise<string | null>;
  createRole: (data: { name: string; color: string; permissions?: ServerRole["permissions"] }) => Promise<string | null>;
  assignMemberRole: (userId: string, roleId: string | null) => Promise<string | null>;
  getMemberColor: (member: ServerMember) => string | null;
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
  markNotificationsRead: () => Promise<void>;
  loadVoicePresence: (channelId: string) => Promise<void>;
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
  channelHasMore: boolean;
  dmHasMore: boolean;
  groupHasMore: boolean;
  loadMoreChannelMessages: () => Promise<void>;
  loadMoreDmMessages: () => Promise<void>;
  loadMoreGroupMessages: () => Promise<void>;
  platformBan: { banned: boolean; reason?: string; vpnBlocked?: boolean } | null;
  refreshPlatformAccess: () => Promise<void>;
  serverPermissions: { kick: boolean; ban: boolean; manage_roles: boolean; manage_server: boolean };
  hasServerPermission: (permission: "kick" | "ban" | "manage_roles" | "manage_server") => boolean;
  updateRole: (
    roleId: string,
    patch: Partial<Pick<ServerRole, "name" | "color" | "permissions">>,
  ) => Promise<string | null>;
  platformBanUser: (opts: { username?: string; userId?: string; password: string; reason?: string }) => Promise<string | null>;
  platformUnbanUser: (opts: { userId: string; password: string }) => Promise<string | null>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [servers, setServers] = useState<Server[]>([]);
  const [categories, setCategories] = useState<ChannelCategory[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [members, setMembers] = useState<(ServerMember & { profile: Profile })[]>([]);
  const [serverRoles, setServerRoles] = useState<ServerRole[]>([]);
  const [messages, setMessages] = useState<(Message & { author: Profile })[]>([]);
  const [dmThreads, setDmThreads] = useState<(DmThread & { friend: Profile })[]>([]);
  const [dmMessages, setDmMessages] = useState<(DmMessage & { author: Profile })[]>([]);
  const [groupChats, setGroupChats] = useState<GroupChatWithMembers[]>([]);
  const [groupCallCounts, setGroupCallCounts] = useState<Map<string, number>>(new Map());
  const [groupMessages, setGroupMessages] = useState<(GroupMessage & { author: Profile })[]>([]);
  const [channelHasMore, setChannelHasMore] = useState(false);
  const [dmHasMore, setDmHasMore] = useState(false);
  const [groupHasMore, setGroupHasMore] = useState(false);
  const [platformBan, setPlatformBan] = useState<{ banned: boolean; reason?: string; vpnBlocked?: boolean } | null>(null);
  const [serverPermissions, setServerPermissions] = useState({
    kick: false,
    ban: false,
    manage_roles: false,
    manage_server: false,
  });
  const [messageReactions, setMessageReactions] = useState<MessageReaction[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [voicePresence, setVoicePresence] = useState<(VoicePresence & { profile: Profile })[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("home");
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [activeDmThreadId, setActiveDmThreadId] = useState<string | null>(null);
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

  const activeDmRef = useRef<string | null>(null);
  const activeChannelRef = useRef<string | null>(null);
  const activeServerRef = useRef<string | null>(null);
  const activeGroupRef = useRef<string | null>(null);
  const channelsRef = useRef<Channel[]>([]);
  const groupChatsRef = useRef<GroupChatWithMembers[]>([]);
  const viewModeRef = useRef<ViewMode>("home");
  const profileRef = useRef<Profile | null>(null);
  const preferredStatusRef = useRef<UserStatus>("online");
  const maxMessageCharsRef = useRef(2000);
  const maxBioLengthRef = useRef(190);
  profileRef.current = profile;
  syncUserSettings(profile);
  channelsRef.current = channels;
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

  const clearDmUnread = useCallback((threadId: string) => {
    setDmUnreadMap((prev) => {
      if (!prev.has(threadId)) return prev;
      const next = new Map(prev);
      next.delete(threadId);
      return next;
    });
  }, []);

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
  }, [userId, patchProfileInState]);

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

  /** Creates a profiles row if the auth trigger missed it (fixes server FK errors). */
  const ensureProfile = useCallback(async (_uid: string, _email?: string | null) => {
    const supabase = getSupabaseClient();
    const { error } = await supabase.rpc("ensure_user_profile");
    return error?.message ?? null;
  }, []);

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
      return;
    }
    const { data } = await supabase.from("servers").select("*").in("id", ids).order("created_at");
    const servers = (data as Server[]) ?? [];
    setCache(cacheKey, servers);
    setServers(servers);
  }, []);

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
    const [{ data: cats }, { data: chs }, { data: mems }, { data: roles }] = await Promise.all([
      supabase.from("channel_categories").select("*").eq("server_id", serverId).order("position"),
      supabase.from("channels").select("*").eq("server_id", serverId).order("position"),
      supabase.from("server_members").select("*").eq("server_id", serverId),
      supabase.from("server_roles").select("*").eq("server_id", serverId).order("position"),
    ]);
    const channelRows = (chs as Channel[]) ?? [];
    setCategories((cats as ChannelCategory[]) ?? []);
    setChannels(channelRows);
    setServerRoles((roles as ServerRole[]) ?? []);
    const memberRows = (mems as ServerMember[]) ?? [];
    if (memberRows.length === 0) {
      setMembers([]);
      return channelRows;
    }
    const { data: profiles } = await supabase
      .from("profiles")
      .select("*")
      .in("id", memberRows.map((m) => m.user_id));
    const map = new Map((profiles as Profile[] | null)?.map((p) => [p.id, p]) ?? []);
    const enrichedMembers = memberRows
      .filter((m) => map.has(m.user_id))
      .map((m) => ({ ...m, profile: map.get(m.user_id)! }));
    setMembers(enrichedMembers);
    if (userId) {
      const { data: perms } = await supabase.rpc("my_server_permissions", { p_server_id: serverId });
      if (perms && typeof perms === "object") {
        setServerPermissions({
          kick: !!(perms as { kick?: boolean }).kick,
          ban: !!(perms as { ban?: boolean }).ban,
          manage_roles: !!(perms as { manage_roles?: boolean }).manage_roles,
          manage_server: !!(perms as { manage_server?: boolean }).manage_server,
        });
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
    const { data } = await supabase
      .from("messages")
      .select("*, author:profiles(*)")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false })
      .limit(MESSAGE_PAGE_SIZE + 1);
    const { rows, hasMore } = paginateDescendingRows(data as (Message & { author: Profile })[] | null);
    setMessages(rows);
    setChannelHasMore(hasMore);
    const ids = rows.map((m) => m.id);
    const rxn = await loadReactionsForMessages(supabase, "channel", ids);
    setMessageReactions((prev) => replaceReactionsForContext(prev, "channel", rxn));
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
    const { data: profiles } = await supabase.from("profiles").select("*").in("id", ids);
    const map = new Map((profiles as Profile[] | null)?.map((p) => [p.id, p]) ?? []);
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

  const loadDmMessages = useCallback(async (threadId: string) => {
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from("dm_messages")
      .select("*, author:profiles(*)")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(MESSAGE_PAGE_SIZE + 1);
    const { rows, hasMore } = paginateDescendingRows(data as (DmMessage & { author: Profile })[] | null);
    setDmMessages(rows);
    setDmHasMore(hasMore);
    const ids = rows.map((m) => m.id);
    const rxn = await loadReactionsForMessages(supabase, "dm", ids);
    setMessageReactions((prev) => replaceReactionsForContext(prev, "dm", rxn));
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
    setMessageReactions((prev) =>
      mergeReactions(
        prev,
        "dm",
        rxn,
        older.map((m) => m.id),
      ),
    );
  }, [activeDmThreadId, dmHasMore, dmMessages]);

  const loadGroupChats = useCallback(async (uid: string) => {
    const supabase = getSupabaseClient();
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
    const { data: profiles } = await supabase.from("profiles").select("*").in("id", profileIds);
    const profileMap = new Map((profiles as Profile[] | null)?.map((p) => [p.id, p]) ?? []);
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

  const loadGroupMessages = useCallback(async (groupId: string) => {
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from("group_messages")
      .select("*, author:profiles(*)")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })
      .limit(MESSAGE_PAGE_SIZE + 1);
    const { rows, hasMore } = paginateDescendingRows(data as (GroupMessage & { author: Profile })[] | null);
    setGroupMessages(rows);
    setGroupHasMore(hasMore);
    const ids = rows.map((m) => m.id);
    const rxn = await loadReactionsForMessages(supabase, "group", ids);
    setMessageReactions((prev) => replaceReactionsForContext(prev, "group", rxn));
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
    const { rows: older, hasMore } = paginateDescendingRows(data as (GroupMessage & { author: Profile })[] | null);
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

  const refreshAll = useCallback(async () => {
    if (!userId) return;
    await Promise.all([
      loadProfile(userId),
      loadServers(userId),
      loadFriendships(userId),
      loadDmThreads(userId),
      loadGroupChats(userId),
      loadNotifications(userId),
    ]);
    if (activeServerId) await loadServerDetails(activeServerId);
    if (activeChannelId) await loadMessages(activeChannelId);
    if (activeDmThreadId) await loadDmMessages(activeDmThreadId);
    if (activeGroupChatId) await loadGroupMessages(activeGroupChatId);
  }, [userId, activeServerId, activeChannelId, activeDmThreadId, activeGroupChatId, loadProfile, loadServers, loadFriendships, loadDmThreads, loadGroupChats, loadNotifications, loadServerDetails, loadMessages, loadDmMessages, loadGroupMessages]);

  // Auth bootstrap
  useEffect(() => {
    if (!configured) {
      setReady(true);
      return;
    }
    const supabase = getSupabaseClient();

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, [configured]);

  const refreshMfaStatus = useCallback(async () => {
    if (!configured) {
      setMfaRequired(false);
      return;
    }
    const { data: { session } } = await getSupabaseClient().auth.getSession();
    if (!session) {
      setMfaRequired(false);
      return;
    }
    const assurance = await getMfaAssurance();
    setMfaRequired(assurance.mfaRequired);
  }, [configured]);

  const refreshPlatformAccess = useCallback(async () => {
    const { data: { session: s } } = await getSupabaseClient().auth.getSession();
    if (!s) {
      setPlatformBan(null);
      return;
    }
    try {
      const res = await fetch("/api/moderation/access", {
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

  useEffect(() => {
    if (!session) {
      setMfaRequired(false);
      setPlatformBan(null);
      return;
    }
    void refreshMfaStatus();
    void refreshPlatformAccess();
  }, [session, refreshMfaStatus, refreshPlatformAccess]);

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
      return;
    }
    void (async () => {
      await ensureProfile(userId, user?.email);
      await refreshAll();
      void primeNotificationPermission();
    })();
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime subscriptions
  useEffect(() => {
    if (!userId || !configured) return;
    const supabase = getSupabaseClient();

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

    return () => {
      void notifSub.unsubscribe();
      void friendSub.unsubscribe();
    };
  }, [userId, configured, loadFriendships]);

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
          void (async () => {
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

  // Live group membership updates
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

  // Live server member list
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

  // Group call activity badges in sidebar
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

  // Live profile updates (avatar/banner) across tabs
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

  // Live status for friends
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

  // Live status for server members
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

  // Live status for group chat members
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

  // Presence: offline when tab closes/hidden, restore preferred status when visible
  useEffect(() => {
    if (!profile) return;
    preferredStatusRef.current = profile.preferred_status ?? profile.status;
  }, [profile?.id, profile?.preferred_status, profile?.status]);

  useEffect(() => {
    if (!userId || !profile || !configured) return;
    const preferred = profile.preferred_status ?? profile.status;
    preferredStatusRef.current = preferred;
    if (document.visibilityState === "visible" && profile.status === "offline" && preferred !== "offline") {
      void setLiveStatus(preferred);
    }
  }, [userId, profile?.id, configured, setLiveStatus]);

  useEffect(() => {
    if (!userId || !configured) return;

    const goOffline = () => { void setLiveStatus("offline"); };
    const restore = () => { void setLiveStatus(preferredStatusRef.current); };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") goOffline();
      else restore();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", goOffline);
    window.addEventListener("pageshow", restore);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", goOffline);
      window.removeEventListener("pageshow", restore);
      goOffline();
    };
  }, [userId, configured, setLiveStatus]);

  // Live reaction updates
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

  // Track unread DMs globally
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
  }, [userId, configured, bumpDmThreadActivity]);

  // Server channel message notifications (when not viewing that channel)
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
          if (msg.mentions?.includes(userId)) return;
          const channel = channelsRef.current.find((c) => c.id === msg.channel_id);
          if (!channel) return;
          const viewingChannel =
            viewModeRef.current === "server" && activeChannelRef.current === msg.channel_id;
          if (!viewingChannel) {
            setServerIndicators((prev) => new Set(prev).add(channel.server_id));
          }
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

  // Server typing indicators (white dot on server icon)
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
          viewModeRef.current === "server"
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

  // Group message notifications (when not viewing that group)
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
          void (async () => {
            const { data: author } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", msg.author_id)
              .maybeSingle();
            if (!author) return;
            notifyUser(
              group.name,
              `${displayName(author as Profile)}: ${msg.content.slice(0, 120)}`,
              { kind: "group", groupId: msg.group_id },
            );
          })();
        },
      )
      .subscribe();
    return () => { void sub.unsubscribe(); };
  }, [userId, configured]);

  const signIn = useCallback(async (email: string, password: string) => {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut({ scope: "local" });
    resetSupabaseClient();
    setProfile(null);

    const { error } = await getSupabaseClient().auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) return mapAuthError(error.message);
    await refreshMfaStatus();
    return null;
  }, [refreshMfaStatus]);

  const signUp = useCallback(async (email: string, password: string, username: string): Promise<SignUpResult> => {
    const supabase = getSupabaseClient();
    const normalized = username.trim().toLowerCase();
    const displayNameVal = username.trim();
    const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/` : undefined;

    try {
      const checkRes = await fetch("/api/auth/signup-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), username: normalized }),
      });
      if (!checkRes.ok) {
        const json = (await checkRes.json()) as { error?: string };
        return { error: json.error ?? "Account creation is not allowed right now." };
      }
    } catch {
      // If the pre-check is unavailable, fall through to Supabase signup (DB triggers still enforce blocks).
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: {
          username: normalized,
          display_name: displayNameVal,
        },
      },
    });

    if (error) {
      return { error: mapProfileError(mapAuthError(error.message), error.code) };
    }

    if (data.session) {
      const { error: profileError } = await supabase.rpc("complete_signup_profile", {
        p_username: normalized,
        p_display_name: displayNameVal,
      });
      if (profileError) return { error: mapProfileError(profileError.message, profileError.code) };
      return { error: null, needsEmailConfirmation: false };
    }

    // No session — email confirmation required (or anti-enumeration response)
    return { error: null, needsEmailConfirmation: true };
  }, []);

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
    if (typeof window !== "undefined") {
      window.location.href = isTauri() ? "/app" : "/home";
    }
  }, [userId]);

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
    }
    const optimistic = { ...profile, ...payload, updated_at: new Date().toISOString() };
    patchProfileInState(optimistic);
    const { error } = await getSupabaseClient().from("profiles").update(payload).eq("id", userId);
    if (error) {
      await loadProfile(userId);
      return mapProfileError(error.message, error.code);
    }
    await loadProfile(userId);
    return null;
  }, [userId, profile, patchProfileInState, loadProfile]);

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

  const selectServer = useCallback(async (serverId: string) => {
    persistActiveServerChannel();
    setViewMode("server");
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
      await loadMessages(target.id);
    } else {
      setActiveChannelId(null);
    }
  }, [loadServerDetails, loadMessages, clearServerIndicator, persistActiveServerChannel]);

  const selectChannel = useCallback((channelId: string) => {
    setActiveChannelId(channelId);
    setActiveDmThreadId(null);
    setActiveGroupChatId(null);
    if (viewMode !== "server") setViewMode("server");
    const channel = channelsRef.current.find((c) => c.id === channelId);
    if (channel) {
      clearServerIndicator(channel.server_id);
      setLastChannelId(channel.server_id, channelId);
    }
  }, [viewMode, clearServerIndicator]);

  const selectDmThread = useCallback(async (threadId: string) => {
    persistActiveServerChannel();
    setViewMode("dm");
    setActiveDmThreadId(threadId);
    setActiveGroupChatId(null);
    setActiveChannelId(null);
    clearDmUnread(threadId);
    await loadDmMessages(threadId);
  }, [loadDmMessages, clearDmUnread, persistActiveServerChannel]);

  const selectGroupChat = useCallback(async (groupId: string) => {
    persistActiveServerChannel();
    setViewMode("group");
    setActiveGroupChatId(groupId);
    setActiveDmThreadId(null);
    setActiveChannelId(null);
    await loadGroupMessages(groupId);
  }, [loadGroupMessages, persistActiveServerChannel]);

  const createGroupChat = useCallback(async (name: string, memberIds: string[]) => {
    if (!userId) return "Not signed in";
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
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc("get_or_create_dm_thread", { p_friend_id: friendId });
    if (error) throw new Error(error.message);
    const threadId = data as string;

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
  }, [userId, friends, selectDmThread, loadDmThreads]);

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
    const normalized = username.trim().toLowerCase();
    if (!normalized) return "Enter a username";

    const supabase = getSupabaseClient();
    const { data: target, error: lookupError } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", normalized)
      .maybeSingle();

    if (lookupError) return lookupError.message;
    if (!target) return `No user found with username "${normalized}"`;
    if (target.id === userId) return "Cannot friend yourself";

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
  }, [userId, activeDmThreadId, dmThreads, loadFriendships]);

  const unblockUser = useCallback(async (targetUserId: string) => {
    if (!userId) return "Not signed in";
    const { error } = await getSupabaseClient().rpc("unblock_user", { p_user_id: targetUserId });
    if (error) return error.message;
    await loadFriendships(userId);
    return null;
  }, [userId, loadFriendships]);

  const createServer = useCallback(async (data: { name: string; iconUrl?: string; bannerUrl?: string; description?: string }) => {
    if (!userId) return "Not signed in";
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
    const { error } = await getSupabaseClient().from("server_members").delete().eq("server_id", serverId).eq("user_id", userId);
    if (error) return error.message;
    await loadServers(userId);
    setViewHome();
    return null;
  }, [userId, loadServers, setViewHome]);

  const joinServerByInvite = useCallback(async (code: string) => {
    if (!userId) return "Not signed in";
    await ensureProfile(userId, user?.email);
    const { data: id, error } = await getSupabaseClient().rpc("join_server_by_invite", { p_code: code });
    if (error) return error.message;
    await loadServers(userId);
    await selectServer(id as string);
    return null;
  }, [userId, user?.email, ensureProfile, loadServers, selectServer]);

  const kickMember = useCallback(async (targetUserId: string) => {
    if (!activeServerId) return "No server selected";
    const { error } = await getSupabaseClient().rpc("kick_server_member", {
      p_server_id: activeServerId,
      p_user_id: targetUserId,
    });
    if (error) return error.message;
    await loadServerDetails(activeServerId);
    return null;
  }, [activeServerId, loadServerDetails]);

  const banMember = useCallback(async (targetUserId: string, reason?: string) => {
    if (!activeServerId) return "No server selected";
    const { error } = await getSupabaseClient().rpc("ban_server_member", {
      p_server_id: activeServerId,
      p_user_id: targetUserId,
      p_reason: reason ?? null,
    });
    if (error) return error.message;
    await loadServerDetails(activeServerId);
    return null;
  }, [activeServerId, loadServerDetails]);

  const createRole = useCallback(async (data: { name: string; color: string; permissions?: ServerRole["permissions"] }) => {
    if (!activeServerId) return "No server selected";
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
    patch: Partial<Pick<ServerRole, "name" | "color" | "permissions">>,
  ) => {
    if (!activeServerId) return "No server selected";
    const update: Record<string, unknown> = {};
    if (patch.name !== undefined) update.name = patch.name.trim();
    if (patch.color !== undefined) update.color = patch.color;
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

  const assignMemberRole = useCallback(async (targetUserId: string, roleId: string | null) => {
    if (!activeServerId) return "No server selected";
    const { error } = await getSupabaseClient()
      .from("server_members")
      .update({ role_id: roleId })
      .eq("server_id", activeServerId)
      .eq("user_id", targetUserId);
    if (error) return error.message;
    await loadServerDetails(activeServerId);
    return null;
  }, [activeServerId, loadServerDetails]);

  const hasServerPermission = useCallback(
    (permission: "kick" | "ban" | "manage_roles" | "manage_server") => serverPermissions[permission],
    [serverPermissions],
  );

  const platformBanUser = useCallback(async (opts: { username?: string; userId?: string; password: string; reason?: string }) => {
    const { data: { session: s } } = await getSupabaseClient().auth.getSession();
    if (!s) return "Not signed in";
    try {
      const res = await fetch("/api/moderation/platform-ban", {
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
      const res = await fetch("/api/moderation/platform-ban", {
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
      if (member.role_id) {
        const role = serverRoles.find((r) => r.id === member.role_id);
        if (role?.color) return role.color;
      }
      return null;
    },
    [serverRoles],
  );

  const sendChannelMessage = useCallback(async (content: string, options: MessageSendOptions = {}) => {
    if (!userId || !activeChannelId || !profile) return "No channel selected";
    const { attachment, replyToId, pendingFile, maxUploadBytes } = options;
    const normalized = normalizeMessageContent(content);
    if (!normalized && !attachment && !pendingFile) return "Empty message";
    const wordErr = messageCharLimitError(normalized, maxMessageCharsRef.current);
    if (wordErr) return wordErr;

    const tempId = `opt-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    let blobUrl: string | null = null;
    let attUrl = attachment?.url ?? null;
    let attType = attachment?.type ?? null;
    let attName = attachment?.name ?? null;
    let attSize = attachment?.size ?? null;
    let attKey = attachment?.key ?? null;

    if (pendingFile) {
      blobUrl = URL.createObjectURL(pendingFile);
      attUrl = blobUrl;
      if (pendingFile.type.startsWith("video/")) attType = "video";
      else if (pendingFile.type.startsWith("image/")) attType = "image";
      else attType = "file";
      attName = pendingFile.name;
      attSize = pendingFile.size;
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
      reply_to_id: replyToId ?? null,
      mentions: parseMentions(normalized, members.map((m) => m.profile), userId),
      created_at: new Date().toISOString(),
      edited_at: null,
      author: profile,
      sending: true,
    };
    setMessages((prev) => {
      const next = [...prev, optimistic];
      const { messages: windowed, trimmed } = trimToLatestWindow(next);
      if (trimmed) setChannelHasMore(true);
      return windowed;
    });

    if (pendingFile && blobUrl) {
      try {
        const result = await uploadMedia(pendingFile, {
          maxUploadBytes,
          onProgress: (progress) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempId ? { ...m, uploadProgress: progress.percent } : m,
              ),
            );
          },
        });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId
              ? { ...m, attachment_url: result.url, attachment_key: result.key, uploadProgress: undefined }
              : m,
          ),
        );
        attUrl = result.url;
        attKey = result.key;
        URL.revokeObjectURL(blobUrl);
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        return "Upload failed. Try a smaller file or different format.";
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
    return null;
  }, [userId, activeChannelId, profile, members]);

  const sendDmMessage = useCallback(async (content: string, options: MessageSendOptions = {}) => {
    if (!userId || !activeDmThreadId || !profile) return "No conversation selected";
    const { attachment, replyToId, pendingFile, maxUploadBytes } = options;
    const normalized = normalizeMessageContent(content);
    if (!normalized && !attachment && !pendingFile) return "Empty message";
    const wordErr = messageCharLimitError(normalized, maxMessageCharsRef.current);
    if (wordErr) return wordErr;

    const thread = dmThreads.find((t) => t.id === activeDmThreadId);
    const other = thread ? [thread.friend] : [];
    const tempId = `opt-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    let blobUrl: string | null = null;
    let attUrl = attachment?.url ?? null;
    let attType = attachment?.type ?? null;
    let attName = attachment?.name ?? null;
    let attSize = attachment?.size ?? null;
    let attKey = attachment?.key ?? null;

    if (pendingFile) {
      blobUrl = URL.createObjectURL(pendingFile);
      attUrl = blobUrl;
      if (pendingFile.type.startsWith("video/")) attType = "video";
      else if (pendingFile.type.startsWith("image/")) attType = "image";
      else attType = "file";
      attName = pendingFile.name;
      attSize = pendingFile.size;
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
    };
    setDmMessages((prev) => {
      const next = [...prev, optimistic];
      const { messages: windowed, trimmed } = trimToLatestWindow(next);
      if (trimmed) setDmHasMore(true);
      return windowed;
    });
    bumpDmThreadActivity(activeDmThreadId, optimistic.created_at);

    if (pendingFile && blobUrl) {
      try {
        const result = await uploadMedia(pendingFile, {
          maxUploadBytes,
          onProgress: (progress) => {
            setDmMessages((prev) =>
              prev.map((m) =>
                m.id === tempId ? { ...m, uploadProgress: progress.percent } : m,
              ),
            );
          },
        });
        setDmMessages((prev) =>
          prev.map((m) =>
            m.id === tempId
              ? { ...m, attachment_url: result.url, attachment_key: result.key, uploadProgress: undefined }
              : m,
          ),
        );
        attUrl = result.url;
        attKey = result.key;
        URL.revokeObjectURL(blobUrl);
      } catch {
        setDmMessages((prev) => prev.filter((m) => m.id !== tempId));
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        return "Upload failed. Try a smaller file or different format.";
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
    return null;
  }, [userId, activeDmThreadId, profile, dmThreads, bumpDmThreadActivity]);

  const sendGroupMessage = useCallback(async (content: string, options: MessageSendOptions = {}) => {
    if (!userId || !activeGroupChatId || !profile) return "No group selected";
    const { attachment, replyToId, pendingFile, maxUploadBytes } = options;
    const normalized = normalizeMessageContent(content);
    if (!normalized && !attachment && !pendingFile) return "Empty message";
    const wordErr = messageCharLimitError(normalized, maxMessageCharsRef.current);
    if (wordErr) return wordErr;

    const group = groupChats.find((g) => g.id === activeGroupChatId);
    const tempId = `opt-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    let blobUrl: string | null = null;
    let attUrl = attachment?.url ?? null;
    let attType = attachment?.type ?? null;
    let attName = attachment?.name ?? null;
    let attSize = attachment?.size ?? null;
    let attKey = attachment?.key ?? null;

    if (pendingFile) {
      blobUrl = URL.createObjectURL(pendingFile);
      attUrl = blobUrl;
      if (pendingFile.type.startsWith("video/")) attType = "video";
      else if (pendingFile.type.startsWith("image/")) attType = "image";
      else attType = "file";
      attName = pendingFile.name;
      attSize = pendingFile.size;
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
    };
    setGroupMessages((prev) => {
      const next = [...prev, optimistic];
      const { messages: windowed, trimmed } = trimToLatestWindow(next);
      if (trimmed) setGroupHasMore(true);
      return windowed;
    });

    if (pendingFile && blobUrl) {
      try {
        const result = await uploadMedia(pendingFile, {
          maxUploadBytes,
          onProgress: (progress) => {
            setGroupMessages((prev) =>
              prev.map((m) =>
                m.id === tempId ? { ...m, uploadProgress: progress.percent } : m,
              ),
            );
          },
        });
        setGroupMessages((prev) =>
          prev.map((m) =>
            m.id === tempId
              ? { ...m, attachment_url: result.url, attachment_key: result.key, uploadProgress: undefined }
              : m,
          ),
        );
        attUrl = result.url;
        attKey = result.key;
        URL.revokeObjectURL(blobUrl);
      } catch {
        setGroupMessages((prev) => prev.filter((m) => m.id !== tempId));
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        return "Upload failed. Try a smaller file or different format.";
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
    return null;
  }, [userId, activeGroupChatId, profile, groupChats]);

  const deleteMessage = useCallback(async (messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    const { error } = await getSupabaseClient().from("messages").delete().eq("id", messageId);
    if (error && activeChannelId) await loadMessages(activeChannelId);
  }, [activeChannelId, loadMessages]);

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

  const loadVoicePresence = useCallback(async (channelId: string) => {
    const supabase = getSupabaseClient();
    const { data: rows } = await supabase.from("voice_presence").select("*").eq("channel_id", channelId);
    if (!rows?.length) {
      setVoicePresence([]);
      return;
    }
    const { data: profiles } = await supabase
      .from("profiles")
      .select("*")
      .in("id", rows.map((r) => r.user_id));
    const map = new Map((profiles as Profile[] | null)?.map((p) => [p.id, p]) ?? []);
    setVoicePresence(
      rows.map((r) => ({ ...r, profile: map.get(r.user_id)! })).filter((r) => r.profile),
    );
  }, []);

  const setMaxMessageChars = useCallback((n: number) => { maxMessageCharsRef.current = n; }, []);
  const setMaxBioLength = useCallback((n: number) => { maxBioLengthRef.current = n; }, []);

  const value: AppContextValue = {
    ready,
    configured,
    session,
    user,
    profile,
    servers,
    categories,
    channels,
    members,
    serverRoles,
    messages,
    dmThreads: sortedDmThreads,
    dmMessages,
    groupChats,
    groupMessages,
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
    updateProfile,
    setViewHome,
    selectServer,
    selectChannel,
    selectDmThread,
    selectGroupChat,
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
    kickMember,
    banMember,
    createRole,
    updateRole,
    assignMemberRole,
    getMemberColor,
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
    markNotificationsRead,
    loadVoicePresence,
    setVoiceJoinedChannelId,
    setCallPhase,
    setMaxMessageChars,
    setMaxBioLength,
    dmUnreads,
    dmListEntries,
    serverUnreadIds,
    getDmUnreadCount,
    clearDmUnread,
    channelHasMore,
    dmHasMore,
    groupHasMore,
    loadMoreChannelMessages,
    loadMoreDmMessages,
    loadMoreGroupMessages,
    platformBan,
    refreshPlatformAccess,
    serverPermissions,
    hasServerPermission,
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

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
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { playMentionPing, requestNotificationPermission, showSystemNotification } from "@/lib/notifications";
import { mapAuthError, type SignUpResult } from "@/lib/authErrors";
import { parseMentions, normalizeMessageContent } from "@/lib/utils";
import {
  matchesOptimisticRow,
  type MessageContext,
  type MessageReaction,
  type MessageSendOptions,
} from "@/lib/messages";
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
  sendFriendRequest: (username: string) => Promise<string | null>;
  respondFriendRequest: (id: string, accept: boolean) => Promise<void>;
  removeFriend: (friendId: string) => Promise<void>;
  createServer: (data: { name: string; iconUrl?: string; bannerUrl?: string; description?: string }) => Promise<string | null>;
  updateServer: (serverId: string, patch: Partial<Server>) => Promise<string | null>;
  deleteServer: (serverId: string) => Promise<string | null>;
  leaveServer: (serverId: string) => Promise<string | null>;
  joinServerByInvite: (code: string) => Promise<string | null>;
  kickMember: (userId: string) => Promise<string | null>;
  banMember: (userId: string, reason?: string) => Promise<string | null>;
  createRole: (data: { name: string; color: string }) => Promise<string | null>;
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
  dmUnread: { threadId: string; friend: Profile; count: number } | null;
  clearDmUnread: (threadId: string) => void;
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
  const [dmUnreadMap, setDmUnreadMap] = useState<
    Map<string, { friend: Profile; count: number; latestAt: string }>
  >(new Map());

  const activeDmRef = useRef<string | null>(null);
  const viewModeRef = useRef<ViewMode>("home");
  const profileRef = useRef<Profile | null>(null);
  const preferredStatusRef = useRef<UserStatus>("online");
  profileRef.current = profile;
  useEffect(() => { activeDmRef.current = activeDmThreadId; }, [activeDmThreadId]);
  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);

  const user = session?.user ?? null;
  const userId = user?.id ?? null;

  const activeServer = servers.find((s) => s.id === activeServerId) ?? null;
  const activeChannel = channels.find((c) => c.id === activeChannelId) ?? null;

  const friends = useMemo(() => {
    if (!userId) return [] as Profile[];
    return friendships
      .filter((f) => f.status === "accepted")
      .map((f) => (f.requester_id === userId ? f.addressee : f.requester))
      .filter((p): p is Profile => !!p);
  }, [friendships, userId]);

  const pendingIncoming = useMemo(
    () => friendships.filter((f) => f.status === "pending" && f.addressee_id === userId),
    [friendships, userId],
  );
  const pendingOutgoing = useMemo(
    () => friendships.filter((f) => f.status === "pending" && f.requester_id === userId),
    [friendships, userId],
  );

  const dmUnread = useMemo((): { threadId: string; friend: Profile; count: number } | null => {
    const entries = [...dmUnreadMap.entries()];
    if (entries.length === 0) return null;
    entries.sort((a, b) => b[1].latestAt.localeCompare(a[1].latestAt));
    const [threadId, entry] = entries[0];
    return { threadId, friend: entry.friend, count: entry.count };
  }, [dmUnreadMap]);

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
    const supabase = getSupabaseClient();
    const { data } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
    if (data) {
      const p = data as Profile;
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
    const supabase = getSupabaseClient();
    const { data: memberships } = await supabase
      .from("server_members")
      .select("server_id")
      .eq("user_id", uid);
    const ids = ((memberships ?? []) as { server_id: string }[]).map((m) => m.server_id);
    if (ids.length === 0) {
      setServers([]);
      return;
    }
    const { data } = await supabase.from("servers").select("*").in("id", ids).order("created_at");
    setServers((data as Server[]) ?? []);
  }, []);

  const loadServerDetails = useCallback(async (serverId: string) => {
    const supabase = getSupabaseClient();
    const [{ data: cats }, { data: chs }, { data: mems }, { data: roles }] = await Promise.all([
      supabase.from("channel_categories").select("*").eq("server_id", serverId).order("position"),
      supabase.from("channels").select("*").eq("server_id", serverId).order("position"),
      supabase.from("server_members").select("*").eq("server_id", serverId),
      supabase.from("server_roles").select("*").eq("server_id", serverId).order("position"),
    ]);
    setCategories((cats as ChannelCategory[]) ?? []);
    setChannels((chs as Channel[]) ?? []);
    setServerRoles((roles as ServerRole[]) ?? []);
    const memberRows = (mems as ServerMember[]) ?? [];
    if (memberRows.length === 0) {
      setMembers([]);
      return;
    }
    const { data: profiles } = await supabase
      .from("profiles")
      .select("*")
      .in("id", memberRows.map((m) => m.user_id));
    const map = new Map((profiles as Profile[] | null)?.map((p) => [p.id, p]) ?? []);
    setMembers(
      memberRows
        .filter((m) => map.has(m.user_id))
        .map((m) => ({ ...m, profile: map.get(m.user_id)! })),
    );
  }, []);

  const loadMessages = useCallback(async (channelId: string) => {
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from("messages")
      .select("*, author:profiles(*)")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: true })
      .limit(100);
    const rows = (data as (Message & { author: Profile })[]) ?? [];
    setMessages(rows);
    const ids = rows.map((m) => m.id);
    if (ids.length) {
      const { data: rxn } = await supabase
        .from("message_reactions")
        .select("*")
        .eq("context_type", "channel")
        .in("message_id", ids);
      setMessageReactions((prev) => [
        ...prev.filter((r) => r.context_type !== "channel"),
        ...((rxn ?? []) as MessageReaction[]),
      ]);
    } else {
      setMessageReactions((prev) => prev.filter((r) => r.context_type !== "channel"));
    }
  }, []);

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
  }, []);

  const loadDmMessages = useCallback(async (threadId: string) => {
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from("dm_messages")
      .select("*, author:profiles(*)")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(100);
    const rows = (data as (DmMessage & { author: Profile })[]) ?? [];
    setDmMessages(rows);
    const ids = rows.map((m) => m.id);
    if (ids.length) {
      const { data: rxn } = await supabase
        .from("message_reactions")
        .select("*")
        .eq("context_type", "dm")
        .in("message_id", ids);
      setMessageReactions((prev) => [
        ...prev.filter((r) => r.context_type !== "dm"),
        ...((rxn ?? []) as MessageReaction[]),
      ]);
    } else {
      setMessageReactions((prev) => prev.filter((r) => r.context_type !== "dm"));
    }
  }, []);

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
      .order("created_at", { ascending: true })
      .limit(100);
    const rows = (data as (GroupMessage & { author: Profile })[]) ?? [];
    setGroupMessages(rows);
    const ids = rows.map((m) => m.id);
    if (ids.length) {
      const { data: rxn } = await supabase
        .from("message_reactions")
        .select("*")
        .eq("context_type", "group")
        .in("message_id", ids);
      setMessageReactions((prev) => [
        ...prev.filter((r) => r.context_type !== "group"),
        ...((rxn ?? []) as MessageReaction[]),
      ]);
    } else {
      setMessageReactions((prev) => prev.filter((r) => r.context_type !== "group"));
    }
  }, []);

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
    void requestNotificationPermission();

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, [configured]);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setServers([]);
      return;
    }
    void (async () => {
      await ensureProfile(userId, user?.email);
      await refreshAll();
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
        if (n.type === "mention") {
          playMentionPing();
          showSystemNotification(n.title, n.body ?? undefined);
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
          if (msg.mentions?.includes(userId)) {
            playMentionPing();
            showSystemNotification("You were mentioned", msg.content);
          }
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
          if (msg.mentions?.includes(userId)) {
            playMentionPing();
            showSystemNotification("You were mentioned", msg.content);
          }
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
  }, [activeDmThreadId, configured, userId, loadDmMessages, profile]);

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
          if (msg.mentions?.includes(userId)) {
            playMentionPing();
            showSystemNotification("You were mentioned", msg.content);
          }
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
          if (viewModeRef.current === "dm" && activeDmRef.current === msg.thread_id) return;

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
          })();
        },
      )
      .subscribe();
    return () => { void sub.unsubscribe(); };
  }, [userId, configured]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
    return error ? mapAuthError(error.message) : null;
  }, []);

  const signUp = useCallback(async (email: string, password: string, username: string): Promise<SignUpResult> => {
    const supabase = getSupabaseClient();
    const normalized = username.trim().toLowerCase();
    const displayNameVal = username.trim();
    const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/` : undefined;

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
      return { error: mapAuthError(error.message) };
    }

    if (data.session) {
      const { error: profileError } = await supabase.rpc("complete_signup_profile", {
        p_username: normalized,
        p_display_name: displayNameVal,
      });
      if (profileError) return { error: profileError.message };
      return { error: null, needsEmailConfirmation: false };
    }

    // No session — email confirmation required (or anti-enumeration response)
    return { error: null, needsEmailConfirmation: true };
  }, []);

  const signOut = useCallback(async () => {
    if (userId) {
      await getSupabaseClient().from("profiles").update({ status: "offline" }).eq("id", userId);
    }
    await getSupabaseClient().auth.signOut();
    setViewMode("home");
    setActiveServerId(null);
    setActiveChannelId(null);
    setActiveDmThreadId(null);
    setActiveGroupChatId(null);
  }, [userId]);

  const updateProfile = useCallback(async (patch: Partial<Profile>) => {
    if (!userId || !profile) return "Not signed in";
    const payload = { ...patch };
    if (payload.username) payload.username = payload.username.trim().toLowerCase();
    if (payload.display_name) payload.display_name = payload.display_name.trim();
    if (payload.status !== undefined) {
      payload.preferred_status = payload.status;
      preferredStatusRef.current = payload.status;
    }
    const optimistic = { ...profile, ...payload, updated_at: new Date().toISOString() };
    patchProfileInState(optimistic);
    const { error } = await getSupabaseClient().from("profiles").update(payload).eq("id", userId);
    if (error) {
      await loadProfile(userId);
      return error.message;
    }
    await loadProfile(userId);
    return null;
  }, [userId, profile, patchProfileInState, loadProfile]);

  const setViewHome = useCallback(() => {
    setViewMode("home");
    setActiveServerId(null);
    setActiveChannelId(null);
    setActiveDmThreadId(null);
    setActiveGroupChatId(null);
  }, []);

  const selectServer = useCallback(async (serverId: string) => {
    setViewMode("server");
    setActiveServerId(serverId);
    setActiveDmThreadId(null);
    setActiveGroupChatId(null);
    await loadServerDetails(serverId);
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from("channels")
      .select("*")
      .eq("server_id", serverId)
      .eq("type", "text")
      .order("position")
      .limit(1);
    const first = (data as Channel[])?.[0];
    if (first) {
      setActiveChannelId(first.id);
      await loadMessages(first.id);
    }
  }, [loadServerDetails, loadMessages]);

  const selectChannel = useCallback((channelId: string) => {
    setActiveChannelId(channelId);
    setActiveDmThreadId(null);
    setActiveGroupChatId(null);
    if (viewMode !== "server") setViewMode("server");
  }, [viewMode]);

  const selectDmThread = useCallback(async (threadId: string) => {
    setViewMode("dm");
    setActiveDmThreadId(threadId);
    setActiveGroupChatId(null);
    setActiveChannelId(null);
    clearDmUnread(threadId);
    await loadDmMessages(threadId);
  }, [loadDmMessages, clearDmUnread]);

  const selectGroupChat = useCallback(async (groupId: string) => {
    setViewMode("group");
    setActiveGroupChatId(groupId);
    setActiveDmThreadId(null);
    setActiveChannelId(null);
    await loadGroupMessages(groupId);
  }, [loadGroupMessages]);

  const createGroupChat = useCallback(async (name: string, memberIds: string[]) => {
    if (!userId) return "Not signed in";
    const { data: id, error } = await getSupabaseClient().rpc("create_group_chat", {
      p_name: name,
      p_member_ids: memberIds,
    });
    if (error) return error.message;
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
    const { data, error } = await getSupabaseClient().rpc("get_or_create_dm_thread", { p_friend_id: friendId });
    if (error) throw new Error(error.message);
    if (userId) await loadDmThreads(userId);
    await selectDmThread(data as string);
  }, [selectDmThread, loadDmThreads, userId]);

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

    const { error } = await supabase.from("friendships").insert({
      requester_id: userId,
      addressee_id: target.id,
    });
    if (error) return error.message;
    await loadFriendships(userId);
    return null;
  }, [userId, loadFriendships]);

  const respondFriendRequest = useCallback(async (id: string, accept: boolean) => {
    if (!userId) return;
    const supabase = getSupabaseClient();
    if (accept) {
      await supabase.from("friendships").update({ status: "accepted" }).eq("id", id);
    } else {
      await supabase.from("friendships").delete().eq("id", id);
    }
    await loadFriendships(userId);
  }, [userId, loadFriendships]);

  const removeFriend = useCallback(async (friendId: string) => {
    if (!userId) return;
    const supabase = getSupabaseClient();
    await supabase
      .from("friendships")
      .delete()
      .or(`and(requester_id.eq.${userId},addressee_id.eq.${friendId}),and(requester_id.eq.${friendId},addressee_id.eq.${userId})`);
    await loadFriendships(userId);
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

  const createRole = useCallback(async (data: { name: string; color: string }) => {
    if (!activeServerId) return "No server selected";
    const { error } = await getSupabaseClient().from("server_roles").insert({
      server_id: activeServerId,
      name: data.name.trim(),
      color: data.color,
      position: serverRoles.length,
    });
    if (error) return error.message;
    await loadServerDetails(activeServerId);
    return null;
  }, [activeServerId, serverRoles.length, loadServerDetails]);

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
    const { attachment, replyToId } = options;
    const normalized = normalizeMessageContent(content);
    if (!normalized && !attachment) return "Empty message";

    const tempId = `opt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimistic: Message & { author: Profile } = {
      id: tempId,
      channel_id: activeChannelId,
      author_id: userId,
      content: normalized,
      attachment_url: attachment?.url ?? null,
      attachment_type: attachment?.type ?? null,
      attachment_key: attachment?.key ?? null,
      attachment_name: attachment?.name ?? null,
      attachment_size: attachment?.size ?? null,
      reply_to_id: replyToId ?? null,
      mentions: parseMentions(normalized, members.map((m) => m.profile)),
      created_at: new Date().toISOString(),
      edited_at: null,
      author: profile,
    };
    setMessages((prev) => [...prev, optimistic]);

    const mentionIds = parseMentions(normalized, members.map((m) => m.profile));
    const { data, error } = await getSupabaseClient()
      .from("messages")
      .insert({
        channel_id: activeChannelId,
        author_id: userId,
        content: normalized,
        attachment_url: attachment?.url ?? null,
        attachment_type: attachment?.type ?? null,
        attachment_key: attachment?.key ?? null,
        attachment_name: attachment?.name ?? null,
        attachment_size: attachment?.size ?? null,
        reply_to_id: replyToId ?? null,
        mentions: mentionIds,
      })
      .select("*, author:profiles(*)")
      .single();

    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      return error.message;
    }
    const saved = data as Message & { author: Profile };
    setMessages((prev) => {
      const without = prev.filter((m) => m.id !== tempId && m.id !== saved.id && !(m.id.startsWith("opt-") && matchesOptimisticRow(m, saved)));
      return [...without, saved];
    });
    return null;
  }, [userId, activeChannelId, profile, members]);

  const sendDmMessage = useCallback(async (content: string, options: MessageSendOptions = {}) => {
    if (!userId || !activeDmThreadId || !profile) return "No conversation selected";
    const { attachment, replyToId } = options;
    const normalized = normalizeMessageContent(content);
    if (!normalized && !attachment) return "Empty message";

    const thread = dmThreads.find((t) => t.id === activeDmThreadId);
    const other = thread ? [thread.friend] : [];
    const tempId = `opt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimistic: DmMessage & { author: Profile } = {
      id: tempId,
      thread_id: activeDmThreadId,
      author_id: userId,
      content: normalized,
      attachment_url: attachment?.url ?? null,
      attachment_type: attachment?.type ?? null,
      attachment_key: attachment?.key ?? null,
      attachment_name: attachment?.name ?? null,
      attachment_size: attachment?.size ?? null,
      reply_to_id: replyToId ?? null,
      mentions: parseMentions(normalized, other),
      created_at: new Date().toISOString(),
      edited_at: null,
      author: profile,
    };
    setDmMessages((prev) => [...prev, optimistic]);

    const mentionIds = parseMentions(normalized, other);
    const { data, error } = await getSupabaseClient()
      .from("dm_messages")
      .insert({
        thread_id: activeDmThreadId,
        author_id: userId,
        content: normalized,
        attachment_url: attachment?.url ?? null,
        attachment_type: attachment?.type ?? null,
        attachment_key: attachment?.key ?? null,
        attachment_name: attachment?.name ?? null,
        attachment_size: attachment?.size ?? null,
        reply_to_id: replyToId ?? null,
        mentions: mentionIds,
      })
      .select("*, author:profiles(*)")
      .single();

    if (error) {
      setDmMessages((prev) => prev.filter((m) => m.id !== tempId));
      return error.message;
    }
    const saved = data as DmMessage & { author: Profile };
    setDmMessages((prev) => {
      const without = prev.filter((m) => m.id !== tempId && m.id !== saved.id && !(m.id.startsWith("opt-") && matchesOptimisticRow(m, saved)));
      return [...without, saved];
    });
    return null;
  }, [userId, activeDmThreadId, profile, dmThreads]);

  const sendGroupMessage = useCallback(async (content: string, options: MessageSendOptions = {}) => {
    if (!userId || !activeGroupChatId || !profile) return "No group selected";
    const { attachment, replyToId } = options;
    const normalized = normalizeMessageContent(content);
    if (!normalized && !attachment) return "Empty message";

    const group = groupChats.find((g) => g.id === activeGroupChatId);
    const tempId = `opt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimistic: GroupMessage & { author: Profile } = {
      id: tempId,
      group_id: activeGroupChatId,
      author_id: userId,
      content: normalized,
      attachment_url: attachment?.url ?? null,
      attachment_type: attachment?.type ?? null,
      attachment_key: attachment?.key ?? null,
      attachment_name: attachment?.name ?? null,
      attachment_size: attachment?.size ?? null,
      reply_to_id: replyToId ?? null,
      mentions: parseMentions(normalized, group?.members ?? []),
      created_at: new Date().toISOString(),
      edited_at: null,
      author: profile,
    };
    setGroupMessages((prev) => [...prev, optimistic]);

    const mentionIds = parseMentions(normalized, group?.members ?? []);
    const { data, error } = await getSupabaseClient()
      .from("group_messages")
      .insert({
        group_id: activeGroupChatId,
        author_id: userId,
        content: normalized,
        attachment_url: attachment?.url ?? null,
        attachment_type: attachment?.type ?? null,
        attachment_key: attachment?.key ?? null,
        attachment_name: attachment?.name ?? null,
        attachment_size: attachment?.size ?? null,
        reply_to_id: replyToId ?? null,
        mentions: mentionIds,
      })
      .select("*, author:profiles(*)")
      .single();

    if (error) {
      setGroupMessages((prev) => prev.filter((m) => m.id !== tempId));
      return error.message;
    }
    const saved = data as GroupMessage & { author: Profile };
    setGroupMessages((prev) => {
      const without = prev.filter((m) => m.id !== tempId && m.id !== saved.id && !(m.id.startsWith("opt-") && matchesOptimisticRow(m, saved)));
      return [...without, saved];
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
    dmThreads,
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
    sendFriendRequest,
    respondFriendRequest,
    removeFriend,
    createServer,
    updateServer,
    deleteServer,
    leaveServer,
    joinServerByInvite,
    kickMember,
    banMember,
    createRole,
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
    dmUnread,
    clearDmUnread,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp requires AppProvider");
  return ctx;
}

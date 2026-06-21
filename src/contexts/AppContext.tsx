"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { playMentionPing, requestNotificationPermission, showSystemNotification } from "@/lib/notifications";
import { parseMentions } from "@/lib/utils";
import type {
  AppNotification,
  Channel,
  ChannelCategory,
  DmMessage,
  DmThread,
  Friendship,
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
  activeChannel: Channel | null;
  activeServer: Server | null;
  micMuted: boolean;
  deafened: boolean;
  setMicMuted: (v: boolean) => void;
  setDeafened: (v: boolean) => void;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string, username: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  refreshAll: () => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<string | null>;
  setViewHome: () => void;
  selectServer: (serverId: string) => Promise<void>;
  selectChannel: (channelId: string) => void;
  selectDmThread: (threadId: string) => Promise<void>;
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
  sendChannelMessage: (content: string, attachment?: { url: string; type: "image" | "video"; key?: string }) => Promise<string | null>;
  sendDmMessage: (content: string, attachment?: { url: string; type: "image" | "video"; key?: string }) => Promise<string | null>;
  deleteMessage: (messageId: string) => Promise<void>;
  deleteDmMessage: (messageId: string) => Promise<void>;
  markNotificationsRead: () => Promise<void>;
  loadVoicePresence: (channelId: string) => Promise<void>;
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
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [voicePresence, setVoicePresence] = useState<(VoicePresence & { profile: Profile })[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("home");
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [activeDmThreadId, setActiveDmThreadId] = useState<string | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);

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

  const loadProfile = useCallback(async (uid: string) => {
    const supabase = getSupabaseClient();
    const { data } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
    if (data) setProfile(data as Profile);
  }, []);

  /** Creates a profiles row if the auth trigger missed it (fixes server FK errors). */
  const ensureProfile = useCallback(async (uid: string, email?: string | null) => {
    const supabase = getSupabaseClient();
    const { data: existing } = await supabase.from("profiles").select("id").eq("id", uid).maybeSingle();
    if (existing) return null;

    const { error } = await supabase.from("profiles").insert({
      id: uid,
      display_name: email?.split("@")[0] ?? "User",
    });
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
    setMessages((data as (Message & { author: Profile })[]) ?? []);
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
    setDmMessages((data as (DmMessage & { author: Profile })[]) ?? []);
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
      loadNotifications(userId),
    ]);
    if (activeServerId) await loadServerDetails(activeServerId);
    if (activeChannelId) await loadMessages(activeChannelId);
    if (activeDmThreadId) await loadDmMessages(activeDmThreadId);
  }, [userId, activeServerId, activeChannelId, activeDmThreadId, loadProfile, loadServers, loadFriendships, loadDmThreads, loadNotifications, loadServerDetails, loadMessages, loadDmMessages]);

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
          void loadMessages(activeChannelId);
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages", filter: `channel_id=eq.${activeChannelId}` },
        () => void loadMessages(activeChannelId),
      )
      .subscribe();
    return () => {
      void sub.unsubscribe();
    };
  }, [activeChannelId, configured, userId, loadMessages]);

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
          void loadDmMessages(activeDmThreadId);
        },
      )
      .subscribe();
    return () => {
      void sub.unsubscribe();
    };
  }, [activeDmThreadId, configured, userId, loadDmMessages]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
    return error?.message ?? null;
  }, []);

  const signUp = useCallback(async (email: string, password: string, username: string) => {
    const supabase = getSupabaseClient();
    const normalized = username.trim().toLowerCase();
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return error.message;
    if (data.user) {
      // Upsert — UPDATE alone fails silently when the trigger didn't create a row
      const { error: profileError } = await supabase.from("profiles").upsert(
        {
          id: data.user.id,
          username: normalized,
          display_name: username.trim(),
        },
        { onConflict: "id" },
      );
      if (profileError) return profileError.message;
    }
    return null;
  }, []);

  const signOut = useCallback(async () => {
    await getSupabaseClient().auth.signOut();
    setViewMode("home");
    setActiveServerId(null);
    setActiveChannelId(null);
    setActiveDmThreadId(null);
  }, []);

  const updateProfile = useCallback(async (patch: Partial<Profile>) => {
    if (!userId) return "Not signed in";
    const payload = { ...patch };
    if (payload.username) payload.username = payload.username.trim().toLowerCase();
    if (payload.display_name) payload.display_name = payload.display_name.trim();
    const { error } = await getSupabaseClient().from("profiles").update(payload).eq("id", userId);
    if (error) return error.message;
    await loadProfile(userId);
    return null;
  }, [userId, loadProfile]);

  const setViewHome = useCallback(() => {
    setViewMode("home");
    setActiveServerId(null);
    setActiveChannelId(null);
    setActiveDmThreadId(null);
  }, []);

  const selectServer = useCallback(async (serverId: string) => {
    setViewMode("server");
    setActiveServerId(serverId);
    setActiveDmThreadId(null);
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
    if (viewMode !== "server") setViewMode("server");
  }, [viewMode]);

  const selectDmThread = useCallback(async (threadId: string) => {
    setViewMode("dm");
    setActiveDmThreadId(threadId);
    setActiveChannelId(null);
    await loadDmMessages(threadId);
  }, [loadDmMessages]);

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

  const sendChannelMessage = useCallback(async (content: string, attachment?: { url: string; type: "image" | "video"; key?: string }) => {
    if (!userId || !activeChannelId) return "No channel selected";
    const mentionIds = parseMentions(content, members.map((m) => m.profile));
    const { error } = await getSupabaseClient().from("messages").insert({
      channel_id: activeChannelId,
      author_id: userId,
      content,
      attachment_url: attachment?.url ?? null,
      attachment_type: attachment?.type ?? null,
      attachment_key: attachment?.key ?? null,
      mentions: mentionIds,
    });
    return error?.message ?? null;
  }, [userId, activeChannelId, members]);

  const sendDmMessage = useCallback(async (content: string, attachment?: { url: string; type: "image" | "video"; key?: string }) => {
    if (!userId || !activeDmThreadId) return "No conversation selected";
    const thread = dmThreads.find((t) => t.id === activeDmThreadId);
    const other = thread ? [thread.friend] : [];
    const mentionIds = parseMentions(content, other);
    const { error } = await getSupabaseClient().from("dm_messages").insert({
      thread_id: activeDmThreadId,
      author_id: userId,
      content,
      attachment_url: attachment?.url ?? null,
      attachment_type: attachment?.type ?? null,
      attachment_key: attachment?.key ?? null,
      mentions: mentionIds,
    });
    return error?.message ?? null;
  }, [userId, activeDmThreadId, dmThreads]);

  const deleteMessage = useCallback(async (messageId: string) => {
    await getSupabaseClient().from("messages").delete().eq("id", messageId);
  }, []);

  const deleteDmMessage = useCallback(async (messageId: string) => {
    await getSupabaseClient().from("dm_messages").delete().eq("id", messageId);
  }, []);

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
    deleteMessage,
    deleteDmMessage,
    markNotificationsRead,
    loadVoicePresence,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp requires AppProvider");
  return ctx;
}

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
import { exchangeRefreshToken, getSupabaseClient, isAccessTokenExpired, isSupabaseConfigured, refreshSessionOnce, resetRefreshState, resetSupabaseClient } from "@/lib/supabase/client";
import { fetchIceServers } from "@/lib/ice-servers";
import { getSavedSessions, getSavedSessionTokens, clearSavedSessionTokens, saveSession as persistSavedSession, removeSavedSession as dropSavedSession, type SavedSession } from "@/lib/saved-sessions";
import { memberIconRole } from "@/lib/role-icons";
import { getSavedRefreshToken, saveSwitchRefreshToken, clearSavedRefreshToken } from "@/lib/switch-refresh-tokens";
import { isTauri } from "@/lib/platform";
import { notifyUser, alertIncomingDm, alertMention, setNotificationFocusState, parseNotificationLink, primeNotificationPermission, isAppInBackground, setCurrentUserStatus } from "@/lib/notifications";
import { requestUnreadJump } from "@/lib/notification-jump";
import { syncUserSettings } from "@/lib/user-settings";
import { getAuthRedirectUrl } from "@/lib/auth-redirect";
import { preloadImages } from "@/lib/preload-images";
import { mapProfileError, mapGroupChatError, mapMessageError } from "@/lib/profileErrors";
import { messageCharLimitError, bioLengthError } from "@/lib/word-limit";
import { getMfaAssurance } from "@/lib/mfa";
import { mapAuthError, TURNSTILE_REQUIRED, type SignUpResult } from "@/lib/authErrors";
import {
  normalizeAccountNumber,
  type AnonAuthResult,
  type AnonSessionPayload,
  type AnonTier,
} from "@/lib/anon-accounts";
import { uploadMedia } from "@/lib/media/uploadMedia";
import { getLastChannelId, setLastChannelId } from "@/lib/server-last-channel";
import { getCached, setCache } from "@/lib/app-cache";
import { refreshOwnBadges } from "@/lib/badge-store";
import { parseMentions, parseMentionTokens, parseRoleMentionTokens, roleMentionSlug, normalizeMessageContent, displayName } from "@/lib/utils";
import {
  AWAY_AFTER_MS,
  flattenPresenceListening,
  flattenPresenceState,
  PRESENCE_CHANNEL,
  type ListeningMap,
  type PresenceMap,
  type PresencePayload,
} from "@/lib/presence";
import {
  fetchLastfmNowPlaying,
  fetchSpotifyNowPlaying,
  readLastfmUsername,
  type Listening,
} from "@/lib/music-presence";
import {
  appendLiveMessage,
  fallbackAuthor,
  matchesOptimisticRow,
  mergeFetchedRows,
  type MessageContext,
  type MessageReaction,
  type MessageSendOptions,
} from "@/lib/messages";
import {
  MESSAGE_PAGE_SIZE,
  capHistoryRows,
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
import { flattenPresenceActivity, type Activity, type ActivityMap } from "@/lib/activity";
import type {
  AppNotification,
  Channel,
  ChannelCategory,
  ChannelEffects,
  DbFriendship,
  DmMessage,
  DmThread,
  Friendship,
  GroupChat,
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

export interface AddAccountPrefill {
  email?: string | null;
  notice?: string | null;
}

interface AppContextValue {
  ready: boolean;

  hydrated: boolean;
  configured: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  tetherProfile: Profile | null;
  officialProfile: Profile | null;
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
  membersLoading: boolean;
  membersHasMore: boolean;
  loadMoreMembers: () => Promise<void>;
  loadAllMembers: () => Promise<void>;
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
  signIn: (email: string, password: string, turnstileToken?: string | null) => Promise<string | null>;
  signUp: (email: string, password: string, username: string, referralCode?: string | null, turnstileToken?: string | null, birthdate?: string | null) => Promise<SignUpResult>;
  requestPasswordReset: (email: string) => Promise<string | null>;
  updatePassword: (password: string) => Promise<string | null>;
  requestAccountDeletion: () => Promise<{ ok?: boolean; error?: string; instant?: boolean; cancel_until?: string; purge_at?: string }>;
  cancelAccountDeletion: () => Promise<{ ok?: boolean; error?: string }>;
  mfaRequired: boolean;
  refreshMfaStatus: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshAll: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  savedSessions: SavedSession[];
  switchAccount: (account: SavedSession) => Promise<string | null>;
  removeSavedAccount: (userId: string) => void;
  registerAnonymousAccount: (tier: AnonTier, turnstileToken?: string | null) => Promise<AnonAuthResult>;
  adoptAnonymousSession: (session: AnonSessionPayload) => Promise<string | null>;
  loginAnonymousAccount: (accountNumber: string, turnstileToken?: string | null) => Promise<AnonAuthResult>;
  exportAnonymousData: (accountNumber: string, turnstileToken?: string | null) => Promise<AnonAuthResult>;
  purgeAnonymousAccount: (accountNumber: string, turnstileToken?: string | null) => Promise<AnonAuthResult>;

  addingAccount: boolean;
  /** Open the add-account sheet; `prefill` names the account to sign back in to. */
  beginAddAccount: (prefill?: AddAccountPrefill) => void;
  cancelAddAccount: () => void;
  addAccountPrefill: AddAccountPrefill | null;
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
  /** Opens (or starts) a DM. Returns an error message, or null on success. */
  openDmWithFriend: (friendId: string) => Promise<string | null>;
  /** Incoming message requests: DMs from people you share a space with, not yet accepted. */
  messageRequests: { threadId: string; friend: Profile; unreadCount: number; sortAt: string; preview: string | null }[];
  /** True when the thread is a message request you received and haven't accepted. */
  isIncomingRequest: (threadId: string | null | undefined) => boolean;
  /** True when the thread is a request you sent that hasn't been answered yet. */
  isOutgoingRequest: (threadId: string | null | undefined) => boolean;
  respondMessageRequest: (threadId: string, action: "accept" | "ignore") => Promise<string | null>;
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
  /** Bumped when the active space's members, roles or channel permissions change. */
  rosterVersion: number;
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
  /** Replace only the caller's self-assignable roles. */
  setSelfRoles: (roleIds: string[]) => Promise<string | null>;
  /** Highest role position the signed-in member holds in the active space. */
  myTopRolePosition: number;
  /** Whether the signed-in member is strictly above a target member in the space's role hierarchy. */
  canModerateMember: (targetUserId: string) => boolean;
  getMemberColor: (member: ServerMember) => string | null;
  /** The member's highest role that has an icon (Catalyst Level 2 role icons). */
  getMemberIconRole: (member: ServerMember) => ServerRole | null;
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

  myCatalysts: MyCatalyst[];
  refreshCatalysts: (serverIds: string[], uid: string) => Promise<void>;
  /** Move one of your Catalysts to another space; returns an error message or null. */
  transferCatalyst: (catalystId: string, toServerId: string) => Promise<string | null>;

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
  closeDmThread: (friendId: string) => void;
  unhideDmFriend: (friendId: string) => void;
  channelUnreadMap: Map<string, number>;
  getChannelUnreadCount: (channelId: string) => number;
  getChannelMentionCount: (channelId: string) => number;
  serverMentionCounts: Map<string, number>;
  getServerMentionCount: (serverId: string) => number;
  groupUnreadMap: Map<string, number>;
  getGroupUnreadCount: (groupId: string) => number;
  clearGroupUnread: (groupId: string) => void;
  presenceMap: PresenceMap;
  /** Live "now listening" per user, from presence. See `listeningFor`. */
  listeningMap: ListeningMap;
  /** Live game activity by user id (see src/lib/activity.ts). */
  activityMap: ActivityMap;
  /** Publish (or clear) your own game activity. Used by the desktop app. */
  setGameActivity: (activity: Activity | null) => void;
  channelHasMore: boolean;
  dmHasMore: boolean;
  groupHasMore: boolean;
  notesHasMore: boolean;
  loadMoreChannelMessages: () => Promise<void>;
  loadChannelContextWindow: (targetMessageId: string) => Promise<boolean>;
  loadDmContextWindow: (targetMessageId: string) => Promise<boolean>;
  loadGroupContextWindow: (targetMessageId: string) => Promise<boolean>;
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
    patch: Partial<Pick<ServerRole, "name" | "color" | "icon" | "permissions" | "gradient_to" | "gradient_animated" | "self_assignable">>,
  ) => Promise<string | null>;
  platformBanUser: (opts: { username?: string; userId?: string; password: string; reason?: string }) => Promise<string | null>;
  platformUnbanUser: (opts: { userId: string; password: string }) => Promise<string | null>;
}

const AppContext = createContext<AppContextValue | null>(null);

/** One of your own Catalysts. The later fields arrive with migration 0181. */
export interface MyCatalyst {
  id?: string;
  server_id: string;
  created_at: string;
  placed_at?: string;
  expires_at?: string | null;
  source?: string;
}

function uploadErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Upload failed. Check your connection and try again.";
}

const UNREAD_SNAPSHOT_PREFIX = "disband:unread:";
const CLOSED_DMS_PREFIX = "disband:closed-dms:";
const BOOT_SNAPSHOT_PREFIX = "disband:boot:";
const BOOT_SNAPSHOT_VERSION = 1;
// A week-old shell is still a better first paint than a spinner; anything
// older is dropped so a long-unused account starts clean.
const BOOT_SNAPSHOT_MAX_AGE = 7 * 24 * 3600_000;

// Member pages are offset-based (`(page - 1) * size`), so every page of a walk
// must use the same size. Kept well under PostgREST's 1,000-row cap because
// each row embeds a full profile: 500 rows is ~600 KB, and that fetch runs
// beside the channel open rather than blocking it.
const MEMBER_PAGE_SIZE = 500;

// Spaces and channels you have been in stay in memory, as Discord keeps
// them: going back paints at once from the snapshot and refreshes behind it.
const SPACE_CACHE_LIMIT = 12;
const CHANNEL_CACHE_LIMIT = 40;
const CHANNEL_SNAPSHOT_ROWS = 100;

interface SpaceSnapshot {
  categories: ChannelCategory[];
  channels: Channel[];
  members: (ServerMember & { profile: Profile })[];
  membersHasMore: boolean;
  roles: ServerRole[];
  permissions: Record<ServerPermissionKey, boolean> | null;
  channelEffects: Record<string, ChannelEffects>;
  timeouts: ServerTimeout[];
  bans: ServerBan[];
}

interface ChannelSnapshot {
  messages: (Message & { author: Profile })[];
  hasMore: boolean;
  reactions: MessageReaction[];
}

/** Insert as most recent, dropping the least recently used past `limit`. */
function rememberRecent<V>(map: Map<string, V>, key: string, value: V, limit: number) {
  map.delete(key);
  map.set(key, value);
  while (map.size > limit) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

function readClosedDms(uid: string): string[] {
  try {
    const raw = window.localStorage.getItem(CLOSED_DMS_PREFIX + uid);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

interface UnreadSnapshot {
  dm: {
    threadId: string;
    friendId: string;
    displayName: string;
    username: string;
    avatarUrl: string | null;
    count: number;
    latestAt: string;
  }[];
  group: { id: string; count: number }[];
  notifications: AppNotification[];
}

function readUnreadSnapshot(uid: string): UnreadSnapshot | null {
  try {
    const raw = window.localStorage.getItem(UNREAD_SNAPSHOT_PREFIX + uid);
    if (!raw) return null;
    return JSON.parse(raw) as UnreadSnapshot;
  } catch {
    return null;
  }
}

/**
 * The last-known shell for an account: spaces, DMs, friends, groups and the
 * notification list. A reload paints from this at once and refreshes behind
 * it, instead of holding the loading screen through every round trip to the
 * database.
 */
interface BootSnapshot {
  v: number;
  savedAt: number;
  profile: Profile | null;
  servers: Server[];
  serverFolders: ServerFolder[];
  serverListState: ServerListState[];
  dmThreads: (DmThread & { friend: Profile })[];
  dmThreadActivity: Record<string, string>;
  friendships: Friendship[];
  groupChats: GroupChatWithMembers[];
  notifications: AppNotification[];
}

type BootState = Omit<BootSnapshot, "v" | "savedAt">;

function readBootSnapshot(uid: string): BootState | null {
  try {
    const raw = window.localStorage.getItem(BOOT_SNAPSHOT_PREFIX + uid);
    if (!raw) return null;
    const snap = JSON.parse(raw) as BootSnapshot;
    if (snap?.v !== BOOT_SNAPSHOT_VERSION || !(Date.now() - snap.savedAt < BOOT_SNAPSHOT_MAX_AGE)) return null;
    // Your own profile sits on one side of every friendship, so it is stored
    // once and put back here.
    const me = snap.profile ?? undefined;
    return {
      ...snap,
      friendships: snap.friendships.map((f) => ({
        ...f,
        requester: f.requester ?? (f.requester_id === uid ? me : undefined),
        addressee: f.addressee ?? (f.addressee_id === uid ? me : undefined),
      })),
    };
  } catch {
    return null;
  }
}

function writeBootSnapshot(uid: string, state: BootState) {
  try {
    const snap: BootSnapshot = {
      ...state,
      v: BOOT_SNAPSHOT_VERSION,
      savedAt: Date.now(),
      friendships: state.friendships.map((f) => ({
        ...f,
        requester: f.requester_id === uid ? undefined : f.requester,
        addressee: f.addressee_id === uid ? undefined : f.addressee,
      })),
    };
    window.localStorage.setItem(BOOT_SNAPSHOT_PREFIX + uid, JSON.stringify(snap));
  } catch {
    // Storage full or blocked: the next load waits for the network instead.
    try { window.localStorage.removeItem(BOOT_SNAPSHOT_PREFIX + uid); } catch { /* ignore */ }
  }
}

/** Per-conversation activity, keeping whichever timestamp is newer. */
function mergeLatestActivity(prev: Record<string, string>, incoming: Record<string, string>): Record<string, string> {
  let next: Record<string, string> | null = null;
  for (const [key, at] of Object.entries(incoming)) {
    const current = prev[key];
    if (current && Date.parse(current) >= Date.parse(at)) continue;
    next ??= { ...prev };
    next[key] = at;
  }
  return next ?? prev;
}

/** DM and group unread counts. Started early so they run beside the shell load. */
function fetchUnreadCounts() {
  const supabase = getSupabaseClient();
  return Promise.all([supabase.rpc("get_dm_unread"), supabase.rpc("get_group_unread")]);
}

/** Startup timing in the console: always in development, in production with `localStorage["disband:startup-timing"] = "1"`. */
function logStartupTiming(line: string) {
  try {
    if (process.env.NODE_ENV === "production" && window.localStorage.getItem("disband:startup-timing") !== "1") return;
  } catch {
    return;
  }
  console.info(`[startup] ${line}`);
}

export function AppProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [ready, setReady] = useState(false);

  const [hydrated, setHydrated] = useState(false);

  const [dataLoaded, setDataLoaded] = useState(false);
  const imagesWarmedRef = useRef(false);
  const bootTimingRef = useRef<{ startedAt?: number; shownAt?: number; freshAt?: number; fromSnapshot?: boolean; logged?: boolean }>({});
  // One line once the app is on screen and its data is fresh. Times are from
  // when the page started loading, so they include downloading the app.
  const reportBootTiming = () => {
    const t = bootTimingRef.current;
    if (t.logged || t.shownAt === undefined || t.freshAt === undefined || t.startedAt === undefined) return;
    t.logged = true;
    logStartupTiming(
      `app shown at ${Math.round(t.shownAt)}ms (${t.fromSnapshot ? "from the saved shell" : "after loading data"}), ` +
      `data fresh at ${Math.round(t.freshAt)}ms; the data load took ${Math.round(t.freshAt - t.startedAt)}ms`,
    );
  };
  const [session, setSession] = useState<Session | null>(null);
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>(() => getSavedSessions());
  const [profile, setProfile] = useState<Profile | null>(null);
  useEffect(() => { setCurrentUserStatus(profile?.status ?? (profile as { preferred_status?: UserStatus } | null)?.preferred_status); }, [profile]);
  const [tetherProfile, setTetherProfile] = useState<Profile | null>(null);
  const [officialProfile, setOfficialProfile] = useState<Profile | null>(null);
  const [servers, setServers] = useState<Server[]>([]);

  const [catalystCounts, setCatalystCounts] = useState<Record<string, number>>({});
  const [myCatalysts, setMyCatalysts] = useState<MyCatalyst[]>([]);
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
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersHasMore, setMembersHasMore] = useState(false);
  // DM rows the user explicitly closed (by friend id). Persisted per user;
  // a new incoming message or opening the DM again brings the row back.
  const [closedDmFriendIds, setClosedDmFriendIds] = useState<string[]>([]);
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
    manage_webhooks: false,
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
  const [rosterVersion, setRosterVersion] = useState(0);
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
  const [serverMentionCounts, setServerMentionCounts] = useState<Map<string, number>>(new Map());
  const [groupUnreadMap, setGroupUnreadMap] = useState<Map<string, number>>(new Map());
  const [presenceMap, setPresenceMap] = useState<PresenceMap>(new Map());
  const [listeningMap, setListeningMap] = useState<ListeningMap>(new Map());
  const [activityMap, setActivityMap] = useState<ActivityMap>(new Map());
  const activityRef = useRef<Activity | null>(null);

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
  const mentionRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Author rows for live messages, shared by the per-conversation feed and the
  // always-on notification feed so a message is looked up once even when both
  // subscriptions receive it.
  const liveAuthorCacheRef = useRef<Map<string, { profile: Profile; at: number }>>(new Map());
  const liveAuthorInflightRef = useRef<Map<string, Promise<Profile | undefined>>>(new Map());
  // Newest rendered row per conversation. The fast catch-up poll reads these
  // instead of closing over state, so every message does not tear down and
  // restart its timer.
  const messagesRef = useRef(messages);
  const dmMessagesRef = useRef(dmMessages);
  const groupMessagesRef = useRef(groupMessages);
  // Set when the open conversation's realtime channel reports an error. The
  // safety-net poll then runs at 100 ms until it reconnects.
  const liveFeedDownRef = useRef(false);
  // Mirrors the runner's latest Spotify poll so presence re-tracks (status
  // changes, channel resubscribes) carry the current track without needing
  // the poll loop to be re-run.
  const listeningRef = useRef<Listening | null>(null);
  const lastActivityRef = useRef<number>(typeof window !== "undefined" ? Date.now() : 0);
  const autoAwayRef = useRef(false);
  const inCallRef = useRef(false);
  const signingOutRef = useRef(false);
  // Member-list paging: opening a space loads only the first 1,000-row page
  // of members (roles and profiles embedded); the rest streams in when the
  // list is scrolled to its end. Five more pages is ~6 MB of JSON on a big
  // space — that must never sit between a click and the channel rail.
  const memberPageRef = useRef(1);
  const membersHasMoreRef = useRef(false);
  const loadingMoreMembersRef = useRef(false);
  const memberFetchBlockedUntilRef = useRef(0);
  const fullMembersRef = useRef<(ServerMember & { profile: Profile })[]>([]);
  const memberRoleIdsRef = useRef<Map<string, string[]>>(new Map());
  const assignableRoleIdsRef = useRef<Set<string>>(new Set());
  const serverDetailsCacheRef = useRef<{ categories: ChannelCategory[]; channels: Channel[]; roles: ServerRole[] } | null>(null);
  const spaceSnapshotsRef = useRef<Map<string, SpaceSnapshot>>(new Map());
  const channelSnapshotsRef = useRef<Map<string, ChannelSnapshot>>(new Map());
  // Which space the permission flags in state belong to; they linger from the
  // previous space until the new space's answer lands.
  const permissionsServerRef = useRef<string | null>(null);
  // A conversation switch can trigger the same load twice (the direct call in
  // the select handler and the chat effect); share the first in-flight fetch
  // instead of paying for the same request twice.
  const inflightChannelLoadsRef = useRef(new Map<string, Promise<void>>());
  const inflightDmLoadsRef = useRef(new Map<string, Promise<void>>());
  const inflightGroupLoadsRef = useRef(new Map<string, Promise<void>>());
  sessionRef.current = session;
  profileRef.current = profile;
  syncUserSettings(profile);

  // Pre-warm TURN/STUN credentials so the first call doesn't pay the
  // /api/turn round trip. Cached 30 min; fire-and-forget.
  useEffect(() => {
    void fetchIceServers();
  }, []);

  const rememberSession = useCallback((s: Session | null | undefined, p?: Profile | null) => {
    persistSavedSession(s, p);
    // Persist the refresh token alongside the saved-account entry so the
    // account stays switchable across restarts (see switch-refresh-tokens).
    if (s?.user?.id && s.refresh_token) saveSwitchRefreshToken(s.user.id, s.refresh_token);
    setSavedSessions(getSavedSessions());
  }, []);

  const removeSavedAccount = useCallback((userId: string) => {
    dropSavedSession(userId);
    clearSavedRefreshToken(userId);
    setSavedSessions(getSavedSessions());
  }, []);

  const [addingAccount, setAddingAccount] = useState(false);
  const [addAccountPrefill, setAddAccountPrefill] = useState<AddAccountPrefill | null>(null);
  const beginAddAccount = useCallback((prefill?: AddAccountPrefill) => {
    setAddAccountPrefill(prefill ?? null);
    setAddingAccount(true);
  }, []);
  const cancelAddAccount = useCallback(() => {
    setAddingAccount(false);
    setAddAccountPrefill(null);
  }, []);

  useEffect(() => {
    if (session && profile) rememberSession(session, profile);
  }, [session, profile, rememberSession]);

  useEffect(() => {
    setAddingAccount(false);
  }, [session?.user?.id]);

  // Private Broadcast channels authorize the websocket with the current
  // access token. supabase-js only forwards SIGNED_IN/TOKEN_REFRESHED events;
  // a session restored from storage emits INITIAL_SESSION, so set it here as
  // well or a restored tab cannot join a private channel.
  useEffect(() => {
    if (!configured) return;
    const supabase = getSupabaseClient();
    void supabase.realtime.setAuth(session?.access_token ?? null);
  }, [configured, session?.access_token]);
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

  // Message requests (migration 0193): a non-friend's thread stays out of the
  // DM list until you reply, accept or become friends. Ignored ones are
  // hidden entirely.
  const incomingRequestIds = useMemo(() => {
    const ids = new Set<string>();
    if (!userId) return ids;
    for (const t of dmThreads) {
      if (t.requested_by && t.requested_by !== userId && !t.accepted_at) ids.add(t.id);
    }
    return ids;
  }, [dmThreads, userId]);

  // Requests have their own count in the Message Requests row, so they never
  // light up the DM badges.
  const dmUnreads = useMemo((): { threadId: string; friend: Profile; count: number }[] => {
    return [...dmUnreadMap.entries()]
      .filter(([threadId, entry]) => entry.count > 0 && !incomingRequestIds.has(threadId))
      .sort((a, b) => b[1].latestAt.localeCompare(a[1].latestAt))
      .map(([threadId, entry]) => ({
        threadId,
        friend: entry.friend,
        count: entry.count,
      }));
  }, [dmUnreadMap, incomingRequestIds]);

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

  const messageRequests = useMemo(() => {
    return sortedDmThreads
      .filter((t) => incomingRequestIds.has(t.id) && !t.request_ignored_at)
      .map((t) => ({
        threadId: t.id,
        friend: t.friend,
        unreadCount: dmUnreadMap.get(t.id)?.count ?? 0,
        sortAt: dmThreadActivity[t.id] ?? t.created_at,
        preview: (t as DmThread & { last_message_preview?: string | null }).last_message_preview ?? null,
      }));
  }, [sortedDmThreads, incomingRequestIds, dmUnreadMap, dmThreadActivity]);

  const isIncomingRequest = useCallback(
    (threadId: string | null | undefined) => !!threadId && incomingRequestIds.has(threadId),
    [incomingRequestIds],
  );

  const isOutgoingRequest = useCallback(
    (threadId: string | null | undefined) => {
      if (!threadId || !userId) return false;
      const t = dmThreads.find((x) => x.id === threadId);
      return !!t && t.requested_by === userId && !t.accepted_at;
    },
    [dmThreads, userId],
  );

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
      if (closedDmFriendIds.includes(thread.friend.id)) continue;
      if (incomingRequestIds.has(thread.id)) continue;
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
      if (closedDmFriendIds.includes(friend.id)) continue;
      entries.push({
        key: `friend-${friend.id}`,
        friend,
        threadId: null,
        unreadCount: 0,
        sortAt: dmThreadActivity[`friend:${friend.id}`] ?? friend.created_at,
      });
    }

    // Order by actual conversation activity, not by when the friendship was
    // created: a freshly added (or re-added) friend with no messages must not
    // jump above threads you have actually talked in. Unread DMs stay pinned
    // to the top until they are read.
    return entries.sort((a, b) => {
      const aUnread = a.unreadCount > 0 ? 1 : 0;
      const bUnread = b.unreadCount > 0 ? 1 : 0;
      if (aUnread !== bUnread) return bUnread - aUnread;
      const aThread = a.threadId ? 1 : 0;
      const bThread = b.threadId ? 1 : 0;
      if (aThread !== bThread) return bThread - aThread;
      return b.sortAt.localeCompare(a.sortAt);
    });
  }, [sortedDmThreads, friends, dmUnreadMap, dmThreadActivity, closedDmFriendIds, incomingRequestIds]);

  const serverUnreadIds = useMemo(() => {
    const ids = new Set(serverIndicators);
    for (const [serverId, count] of serverMentionCounts) {
      if (count > 0) ids.add(serverId);
    }
    return [...ids];
  }, [serverIndicators, serverMentionCounts]);

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

  const markGroupReadNow = useCallback(async (groupId: string) => {
    // PostgREST builders are lazy: a bare `void rpc(...)` never sends a request.
    const { error } = await getSupabaseClient().rpc("mark_group_read", { p_group_id: groupId });
    if (error) console.error("mark_group_read failed", error.message);
  }, []);

  const clearDmUnread = useCallback((threadId: string) => {
    setDmUnreadMap((prev) => {
      if (!prev.has(threadId)) return prev;
      const next = new Map(prev);
      next.delete(threadId);
      return next;
    });
  }, []);

  const persistClosedDms = useCallback((uid: string, ids: string[]) => {
    try {
      window.localStorage.setItem(CLOSED_DMS_PREFIX + uid, JSON.stringify(ids));
    } catch {
      // Storage unavailable: the in-memory set still applies this session.
    }
  }, []);

  const closeDmThread = useCallback((friendId: string) => {
    const uid = sessionRef.current?.user?.id ?? userId;
    setClosedDmFriendIds((prev) => {
      if (prev.includes(friendId)) return prev;
      const next = [...prev, friendId];
      if (uid) persistClosedDms(uid, next);
      return next;
    });
  }, [userId, persistClosedDms]);

  const unhideDmFriend = useCallback((friendId: string) => {
    const uid = sessionRef.current?.user?.id ?? userId;
    setClosedDmFriendIds((prev) => {
      if (!prev.includes(friendId)) return prev;
      const next = prev.filter((id) => id !== friendId);
      if (uid) persistClosedDms(uid, next);
      return next;
    });
  }, [userId, persistClosedDms]);

  // Load the closed-DM set whenever the account changes.
  useEffect(() => {
    if (!userId || typeof window === "undefined") {
      if (!userId) setClosedDmFriendIds([]);
      return;
    }
    setClosedDmFriendIds(readClosedDms(userId));
  }, [userId]);

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

  // Last-known attention state, persisted per user so a refresh paints DM /
  // group badges and the notification list instantly — before the network
  // round-trips finish. The server counts overwrite it moments later, and
  // clearing a badge updates the snapshot too, so a read badge never comes
  // back from the dead.
  useEffect(() => {
    if (!userId || typeof window === "undefined") return;
    try {
      const snapshot: UnreadSnapshot = {
        dm: [...dmUnreadMap.entries()].map(([threadId, entry]) => ({
          threadId,
          friendId: entry.friend.id,
          displayName: entry.friend.display_name ?? entry.friend.username ?? "",
          username: entry.friend.username ?? "",
          avatarUrl: entry.friend.avatar_url ?? null,
          count: entry.count,
          latestAt: entry.latestAt,
        })),
        group: [...groupUnreadMap.entries()].map(([id, count]) => ({ id, count })),
        notifications: notifications.slice(0, 30),
      };
      window.localStorage.setItem(UNREAD_SNAPSHOT_PREFIX + userId, JSON.stringify(snapshot));
    } catch {
      // Storage full or unavailable: the server re-seed covers it.
    }
  }, [userId, dmUnreadMap, groupUnreadMap, notifications]);

  const seedUnread = useCallback(async (
    uid: string,
    threads?: (DmThread & { friend: Profile })[],
    prefetched?: ReturnType<typeof fetchUnreadCounts>,
  ) => {
    // Prefer the freshly loaded list when the caller has it: state (and the
    // synced ref) only update on the next render, so reading them here right
    // after a reload sees the pre-reload list and drops every badge.
    const list = threads ?? dmThreadsRef.current;
    const threadByFriend = new Map(list.map((t) => [t.friend.id, t]));

    const [{ data: dm }, { data: grp }] = await (prefetched ?? fetchUnreadCounts());

    if (sessionRef.current?.user.id !== uid) return;
    setDmUnreadMap((prev) => {
      const next = new Map<string, { friend: Profile; count: number; latestAt: string }>();
      for (const row of dm ?? []) {
        if (row.unread_count <= 0) continue;
        const existing = prev.get(row.thread_id);
        const friend =
          existing?.friend ??
          list.find((x) => x.id === row.thread_id)?.friend ??
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
        if (row.unread_count > 0 && !(viewModeRef.current === "group" && activeGroupRef.current === row.group_id && document.visibilityState === "visible")) next.set(row.group_id, row.unread_count);
      }
      return next;
    });
  }, []);

  const refreshMentionUnread = useCallback(async () => {
    if (!userId) return;
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc("get_channel_mention_unread");
    if (error || sessionRef.current?.user.id !== userId) return;

    const activeChannel =
      viewModeRef.current === "space" && document.visibilityState === "visible"
        ? activeChannelRef.current
        : null;
    const channelCounts = new Map<string, number>();
    const serverCounts = new Map<string, number>();
    const acknowledged = new Set<string>();

    for (const row of data ?? []) {
      const count = Number(row.mention_count ?? 0);
      if (count <= 0) continue;
      // If the mention is in the channel currently on screen, the user has
      // already seen it. Clear the durable notification instead of painting a
      // badge for a message sitting in front of them.
      if (activeChannel && row.channel_id === activeChannel) {
        acknowledged.add(row.channel_id);
        continue;
      }
      channelCounts.set(row.channel_id, count);
      serverCounts.set(row.server_id, (serverCounts.get(row.server_id) ?? 0) + count);
    }

    setChannelMentionMap(channelCounts);
    setServerMentionCounts(serverCounts);

    if (acknowledged.size === 0) return;
    await Promise.all(
      [...acknowledged].map((channelId) =>
        supabase.rpc("mark_channel_mentions_read", { p_channel_id: channelId }),
      ),
    );
    setNotifications((prev) =>
      prev.map((n) => {
        if (n.read || n.type !== "mention" || !n.link?.startsWith("channel:")) return n;
        return acknowledged.has(n.link.slice("channel:".length)) ? { ...n, read: true } : n;
      }),
    );
  }, [userId]);

  const markChannelMentionsRead = useCallback(async (channelId: string) => {
    setChannelMentionMap((prev) => {
      if (!prev.has(channelId)) return prev;
      const next = new Map(prev);
      next.delete(channelId);
      return next;
    });
    setNotifications((prev) =>
      prev.map((n) =>
        !n.read && n.type === "mention" && n.link === `channel:${channelId}`
          ? { ...n, read: true }
          : n,
      ),
    );
    if (!userId) return;
    const { error } = await getSupabaseClient().rpc("mark_channel_mentions_read", {
      p_channel_id: channelId,
    });
    if (!error) await refreshMentionUnread();
  }, [userId, refreshMentionUnread]);

  const scheduleMentionRefresh = useCallback(() => {
    if (mentionRefreshTimerRef.current) return;
    mentionRefreshTimerRef.current = setTimeout(() => {
      mentionRefreshTimerRef.current = null;
      void refreshMentionUnread();
    }, 200);
  }, [refreshMentionUnread]);

  useEffect(() => () => {
    if (mentionRefreshTimerRef.current) {
      clearTimeout(mentionRefreshTimerRef.current);
      mentionRefreshTimerRef.current = null;
    }
  }, []);

  const patchProfileInState = useCallback((updated: Profile) => {
    setProfile((prev) => (prev?.id === updated.id ? { ...prev, ...updated } : prev));
    setDmThreads((prev) =>
      prev.map((t) => (t.friend.id === updated.id ? { ...t, friend: { ...t.friend, ...updated } } : t)),
    );
    setGroupChats((prev) =>
      prev.map((g) => ({
        ...g,
        members: (g.members ?? []).map((m) => (m.id === updated.id ? { ...m, ...updated } : m)),
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

  useEffect(() => {
    liveAuthorCacheRef.current.clear();
    liveAuthorInflightRef.current.clear();
  }, [userId]);

  const resolveLiveAuthor = useCallback((authorId: string): Promise<Profile | undefined> => {
    const self = profileRef.current;
    if (!authorId || authorId === userId) return Promise.resolve(self ?? undefined);

    const cached = liveAuthorCacheRef.current.get(authorId);
    if (cached && Date.now() - cached.at < 60_000) return Promise.resolve(cached.profile);

    const inflight = liveAuthorInflightRef.current.get(authorId);
    if (inflight) return inflight;

    const run = (async () => {
      const { data } = await getSupabaseClient()
        .from("profiles")
        .select("*")
        .eq("id", authorId)
        .maybeSingle();
      const profile = (data as Profile | null) ?? undefined;
      if (profile) {
        if (liveAuthorCacheRef.current.size > 250) liveAuthorCacheRef.current.clear();
        liveAuthorCacheRef.current.set(authorId, { profile, at: Date.now() });
      }
      return profile;
    })().finally(() => {
      liveAuthorInflightRef.current.delete(authorId);
    });
    liveAuthorInflightRef.current.set(authorId, run);
    return run;
  }, [userId]);

  const setLocalPresence = useCallback((status: UserStatus) => {
    if (!userId) return;
    setPresenceMap((prev) => {
      if (prev.get(userId) === status) return prev;
      const next = new Map(prev);
      next.set(userId, status);
      return next;
    });
  }, [userId]);

  const setLiveStatus = useCallback(async (status: UserStatus) => {
    if (!userId) return;
    const current = profileRef.current;
    if (current) {
      patchProfileInState({ ...current, status, updated_at: new Date().toISOString() });
    }
    setLocalPresence(status);
    await getSupabaseClient().from("profiles").update({ status }).eq("id", userId);
    const payload: PresencePayload = { userId, status, listening: listeningRef.current, activity: activityRef.current };
    void presenceChannelRef.current?.track(payload).then();
  }, [userId, patchProfileInState, setLocalPresence]);

  const trackPresence = useCallback(async (status: UserStatus) => {
    if (!userId) return;
    setLocalPresence(status);
    const payload: PresencePayload = { userId, status, listening: listeningRef.current, activity: activityRef.current };
    void presenceChannelRef.current?.track(payload).then();
  }, [userId, setLocalPresence]);

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
      const state = channel.presenceState() as Record<string, PresencePayload[]>;
      setPresenceMap(flattenPresenceState(state));
      setListeningMap(flattenPresenceListening(state));
      setActivityMap(flattenPresenceActivity(state));
    });
    void channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        presenceChannelRef.current = channel;
        const preferred = profileRef.current?.preferred_status ?? "online";
        const live = profileRef.current?.status ?? "online";
        const effective = live === "offline" && preferred !== "offline" ? preferred : live;
        // Paint our own row immediately. Waiting for the next presence sync
        // made the signed-in member look offline in the roster for a moment.
        setLocalPresence(effective);
        await channel.track({ userId, status: effective, listening: listeningRef.current, activity: activityRef.current } satisfies PresencePayload);
      }
    });
    return () => {
      if (presenceChannelRef.current === channel) presenceChannelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [userId, configured, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Game activity from the desktop app (detected games and Rich Presence).
  // Mirrored onto presence, which is what everyone online reads, and onto the
  // profile row for people who load it later; the row's expiry covers a
  // crash. Only real changes and the once-a-minute renewal are written.
  const lastActivityWriteRef = useRef(0);
  const setGameActivity = useCallback((activity: Activity | null) => {
    if (!userId) return;
    const prev = activityRef.current;
    // Nothing playing, still nothing playing: no presence or database write.
    if (!prev && !activity) return;
    activityRef.current = activity;
    setActivityMap((map) => {
      const next = new Map(map);
      next.set(userId, activity);
      return next;
    });
    const status = profileRef.current?.status ?? "online";
    void presenceChannelRef.current?.track({ userId, status, listening: listeningRef.current, activity } satisfies PresencePayload).then();
    const changed = (prev?.name ?? null) !== (activity?.name ?? null)
      || prev?.details !== activity?.details || prev?.state !== activity?.state;
    if (!changed && Date.now() - lastActivityWriteRef.current < 55_000) return;
    lastActivityWriteRef.current = Date.now();
    getSupabaseClient()
      .from("profiles")
      .update({ activity, activity_updated_at: new Date().toISOString() })
      .eq("id", userId)
      .then(() => {}, () => {});
  }, [userId]);

  // Music presence: while a Spotify connection exists, poll what's playing
  // and mirror it onto presence (live, seen by everyone online) and the
  // profile row (persisted, seen when we're offline). Polling is fast while
  // the window is visible so a track change or restart appears immediately;
  // it backs off while hidden. Only meaningful changes are published.
  useEffect(() => {
    if (!userId || !configured) return;
    let alive = true;
    let inFlight = false;
    let lastKey: string | null = null;
    let lastPublished: Listening | null = null;
    let timer: number | null = null;
    const supabase = getSupabaseClient();

    const publish = (listening: Listening | null) => {
      listeningRef.current = listening;
      const status = profileRef.current?.status ?? "online";
      void presenceChannelRef.current?.track({ userId, status, listening, activity: activityRef.current } satisfies PresencePayload).then();
      setListeningMap((prev) => {
        const next = new Map(prev);
        next.set(userId, listening);
        return next;
      });
      const current = profileRef.current;
      if (current) patchProfileInState({ ...current, listening, updated_at: new Date().toISOString() });
      // supabase-js query builders are lazy: the request only leaves when the
      // builder is awaited or then()'d. A bare `void` call is a silent no-op.
      supabase
        .from("profiles")
        .update({ listening })
        .eq("id", userId)
        .then(
          () => {},
          () => {},
        );
    };

    const trackKey = (listening: Listening | null) => listening
      ? `${listening.source}|${listening.track}|${listening.artists}|${listening.album ?? ""}`
      : "idle";

    const tick = async () => {
      if (!alive || inFlight) return;
      inFlight = true;
      try {
        const lastfmUser = readLastfmUsername(userId);
        let next: Listening | null = null;
        let spotifyConnected = false;
        let failed = false;
        try {
          // The server owns the tokens, so this also sees a connection made in
          // the web app while the desktop app was closed, and vice versa.
          const res = await fetchSpotifyNowPlaying();
          if (!alive) return;
          spotifyConnected = res.connected;
          next = res.listening;
        } catch {
          failed = true;
        }
        if (!spotifyConnected && !lastfmUser) {
          // The server said this account has no connection (and there is no
          // Last.fm fallback). A provider error, on the other hand, keeps the
          // last known track until the next tick.
          if (failed) return;
          if (lastKey !== "disconnected") {
            lastKey = "disconnected";
            lastPublished = null;
            if (listeningRef.current) publish(null);
          }
          return;
        }
        if (!next && lastfmUser) {
          try {
            next = await fetchLastfmNowPlaying(lastfmUser);
          } catch {
            failed = true;
          }
        }
        if (!alive) return;
        // A provider error is not proof of silence: keep the last known state
        // and let the next tick decide.
        if (!next && failed) return;
        const key = trackKey(next);
        // A restart/seek of the same song keeps the track fields identical but
        // moves started_at. Compare against the last *published* value, not
        // the previous poll (which naturally drifts by a second or two), so a
        // real seek/restart is published but polling jitter is ignored.
        const drift = next && lastPublished && key === trackKey(lastPublished)
          ? Math.abs(Date.parse(next.started_at) - Date.parse(lastPublished.started_at))
          : 0;
        const changed = key !== lastKey || drift > 2_000;
        if (changed) {
          lastKey = key;
          lastPublished = next;
          publish(next);
        }
      } finally {
        inFlight = false;
      }
    };

    const schedule = () => {
      if (!alive) return;
      const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
      timer = window.setTimeout(async () => {
        await tick();
        schedule();
      }, hidden ? 30_000 : 5_000);
    };

    const wake = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void tick();
    };

    void tick();
    schedule();
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", wake);
    }
    window.addEventListener("focus", wake);
    return () => {
      alive = false;
      if (timer !== null) window.clearTimeout(timer);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", wake);
      }
      window.removeEventListener("focus", wake);
      // Polling has stopped, so the persisted row is now stale — clear it
      // so an approaching viewer isn't told about yesterday's song.
      listeningRef.current = null;
      // Same lazy-builder caveat as publish(): without then() this never sends.
      supabase
        .from("profiles")
        .update({ listening: null })
        .eq("id", userId)
        .then(
          () => {},
          () => {},
        );
    };
  }, [userId, configured]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Resolve the official account the same way, so the DM thread with
  // @disband can be recognised (locked composer, embed rendering) without
  // hardcoding its id in components. Display logic only — the read-only
  // enforcement lives in RLS (official_dm_readonly).
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      const { data } = await getSupabaseClient()
        .from("profiles")
        .select("*")
        .eq("username", "disband")
        .eq("is_bot", true)
        .maybeSingle();
      if (cancelled || !data) return;
      setOfficialProfile(data as Profile);
    })();
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
    const [{ data: all }, mineRes] = await Promise.all([
      supabase.from("server_catalysts").select("server_id").in("server_id", serverIds),
      supabase.from("server_catalysts").select("id,server_id,created_at,placed_at,expires_at,source").eq("user_id", uid),
    ]);
    // Before migration 0181 there is no placed_at/expires_at to read.
    const mine = mineRes.error
      ? (await supabase.from("server_catalysts").select("id,server_id,created_at,source").eq("user_id", uid)).data
      : mineRes.data;
    const counts: Record<string, number> = {};
    for (const row of (all as { server_id: string }[] | null) ?? []) {
      counts[row.server_id] = (counts[row.server_id] ?? 0) + 1;
    }
    setCatalystCounts(counts);
    setMyCatalysts((mine as MyCatalyst[] | null) ?? []);
  }, []);

  const allocateCatalyst = useCallback(async (serverId: string) => {
    if (!userId) return "Not signed in";
    // Grants are written by /api/catalysts/allocate (service role): since
    // 0112 clients cannot INSERT into server_catalysts at all, and the old
    // direct insert here 403'd for everyone. The route enforces the monthly
    // grant (Aero 4, Lite 1) against the caller's effective plan.
    try {
      const res = await apiFetch("/api/catalysts/allocate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server_id: serverId }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) return json?.error ?? "Could not add catalyst.";
      await refreshCatalysts(servers.map((s) => s.id), userId);
      return null;
    } catch {
      return "Could not reach Disband.";
    }
  }, [userId, servers, refreshCatalysts]);

  const transferCatalyst = useCallback(async (catalystId: string, toServerId: string) => {
    if (!userId) return "Not signed in";
    const { error } = await getSupabaseClient().rpc("transfer_catalyst", {
      p_catalyst_id: catalystId,
      p_to_server: toServerId,
    });
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
    // The spaces come back with the memberships in one request, instead of
    // reading the memberships and then the spaces one after the other.
    const { data } = await supabase
      .from("server_members")
      .select("server:servers!server_id(*)")
      .eq("user_id", uid);
    const servers = ((data ?? []) as unknown as { server: Server | null }[])
      .map((row) => row.server)
      .filter((server): server is Server => !!server)
      .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
    setCache(cacheKey, servers);
    setServers(servers);
    void refreshCatalysts(servers.map((server) => server.id), uid);
  }, [refreshCatalysts]);

  const writeMembersCache = useCallback((serverId: string) => {
    const details = serverDetailsCacheRef.current;
    if (!details) return;
    const members = fullMembersRef.current;
    setCache(
      `server-details:${serverId}`,
      {
        categories: details.categories,
        channels: details.channels,
        members,
        roles: details.roles,
        membersHasMore: membersHasMoreRef.current,
      },
      undefined,
      // Multi-megabyte rosters stay memory-only: base64-encoding them into
      // localStorage on every write janks the main thread and usually blows
      // the quota anyway.
      { persist: members.length <= 300 },
    );
  }, []);

  const loadServerDetails = useCallback(async (serverId: string, opts?: { refreshMembers?: boolean }) => {
    const cacheKey = `server-details:${serverId}`;
    // A cached roster is served on revisits (within the TTL), but membership
    // mutations — a kick, a ban, a role change, a join/leave event — pass
    // refreshMembers so the roster they just changed is not read back stale.
    const cached = opts?.refreshMembers
      ? null
      : getCached<{
          categories: ChannelCategory[];
          channels: Channel[];
          members: (ServerMember & { profile: Profile })[];
          roles: ServerRole[];
          membersHasMore?: boolean;
        }>(cacheKey);
    // Past the cache's five minutes, the in-memory snapshot still paints the
    // roster while page 1 is fetched again, instead of skeletons.
    const snapshot = opts?.refreshMembers ? undefined : spaceSnapshotsRef.current.get(serverId);
    const shown = cached ?? (snapshot
      ? { categories: snapshot.categories, channels: snapshot.channels, members: snapshot.members, roles: snapshot.roles }
      : null);
    if (shown) {
      setCategories(shown.categories);
      setChannels(shown.channels);
      if (shown.members.length > 0) setMembers(shown.members);
      setServerRoles(shown.roles);
    }
    // Nothing to show yet: the member list shows skeletons, not "0".
    if (!shown || shown.members.length === 0) setMembersLoading(true);
    const supabase = getSupabaseClient();

    // Fast path — only what the channel rail needs. Members, roles and
    // permissions used to be awaited here too, and on a large space their
    // fetch is five 1,000-row pages (~6 MB of JSON with profiles embedded):
    // the first message could not start loading until all of it had arrived,
    // which is what made opening a space take seconds. Everything else now
    // streams in behind the first paint.
    const [{ data: cats }, { data: chs }] = await Promise.all([
      supabase.from("channel_categories").select("*").eq("server_id", serverId).order("position"),
      supabase.from("channels").select("*").eq("server_id", serverId).order("position"),
    ]);
    const channelRows = (chs as Channel[]) ?? [];
    if (activeServerRef.current !== serverId) return channelRows;
    setCategories((cats as ChannelCategory[]) ?? []);
    setChannels(channelRows);
    serverDetailsCacheRef.current = {
      categories: (cats as ChannelCategory[]) ?? [],
      channels: channelRows,
      roles: shown?.roles ?? [],
    };

    void (async () => {
      try {
        const uid = sessionRef.current?.user?.id ?? null;
        const needsMembers = !cached || cached.members.length === 0;
        const [rolesRes, roleRowsRes, permsRes, effectsRes, memberPage1] = await Promise.all([
          supabase.from("server_roles").select("*").eq("server_id", serverId).order("position"),
          supabase.from("member_roles").select("server_id, user_id, role_id").eq("server_id", serverId),
          uid
            ? supabase.rpc("my_server_permissions", { p_server_id: serverId })
            : Promise.resolve({ data: null }),
          uid
            ? supabase.rpc("my_channel_effects", { p_server_id: serverId })
            : Promise.resolve({ data: null }),
          // Revisits skip the member refetch entirely: the roster changes
          // rarely, and probing for it costs a megabyte per page.
          needsMembers
            ? supabase.rpc("get_server_members", { p_server_id: serverId, p_page: 1, p_page_size: MEMBER_PAGE_SIZE })
            : Promise.resolve({ data: null }),
        ]);
        if (activeServerRef.current !== serverId) return;

        const serverRoles = (rolesRes.data as ServerRole[]) ?? [];
        setServerRoles(serverRoles);
        const roleIdsByMember = new Map<string, string[]>();
        for (const row of (roleRowsRes.data ?? []) as { user_id: string; role_id: string }[]) {
          const list = roleIdsByMember.get(row.user_id) ?? [];
          list.push(row.role_id);
          roleIdsByMember.set(row.user_id, list);
        }
        memberRoleIdsRef.current = roleIdsByMember;
        const assignableRoleIds = new Set(
          serverRoles.filter((r) => !r.is_default).map((r) => r.id),
        );
        assignableRoleIdsRef.current = assignableRoleIds;
        serverDetailsCacheRef.current = {
          categories: serverDetailsCacheRef.current?.categories ?? [],
          channels: serverDetailsCacheRef.current?.channels ?? [],
          roles: serverRoles,
        };

        if (permsRes.data && typeof permsRes.data === "object") {
          const p = permsRes.data as Record<string, unknown>;
          permissionsServerRef.current = serverId;
          setServerPermissions({
            kick: !!p.kick,
            ban: !!p.ban,
            manage_roles: !!p.manage_roles,
            manage_server: !!p.manage_server,
            manage_channels: !!p.manage_channels,
            manage_messages: !!p.manage_messages,
            manage_emojis: !!p.manage_emojis,
            manage_webhooks: !!p.manage_webhooks,
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
        if (Array.isArray(effectsRes.data)) {
          const map: Record<string, ChannelEffects> = {};
          for (const row of effectsRes.data as (ChannelEffects & { channel_id: string })[]) {
            map[row.channel_id] = {
              can_view: !!row.can_view,
              can_post: !!row.can_post,
              can_react: !!row.can_react,
              can_attach: !!row.can_attach,
            };
          }
          setChannelEffects(map);
        }

        if (needsMembers) {
          const pageRows = (memberPage1.data ?? []) as (ServerMember & { profile: Profile })[];
          const enriched = pageRows
            .filter((m) => m.profile != null)
            .map((m) => ({
              ...m,
              role_ids: (roleIdsByMember.get(m.user_id) ?? []).filter((id) => assignableRoleIds.has(id)),
            }));
          fullMembersRef.current = enriched;
          memberPageRef.current = 1;
          const more = pageRows.length === MEMBER_PAGE_SIZE;
          membersHasMoreRef.current = more;
          setMembersHasMore(more);
          setMembers(enriched);
          writeMembersCache(serverId);
        } else {
          fullMembersRef.current = cached!.members;
          memberPageRef.current = Math.max(1, Math.ceil(cached!.members.length / MEMBER_PAGE_SIZE));
          const more = cached!.membersHasMore ?? false;
          membersHasMoreRef.current = more;
          setMembersHasMore(more);
        }
        setMembersLoading(false);

        const now = new Date().toISOString();
        const [{ data: timeoutRows }, { data: banRows }] = await Promise.all([
          supabase.from("server_timeouts").select("*").eq("server_id", serverId).gt("expires_at", now),
          supabase.from("server_bans").select("server_id, user_id, banned_by, reason, created_at").eq("server_id", serverId),
        ]);
        if (activeServerRef.current !== serverId) return;
        setServerTimeouts((timeoutRows as ServerTimeout[]) ?? []);
        const bans = (banRows ?? []) as Omit<ServerBan, "profile">[];
        if (!bans.length) {
          setServerBans([]);
          return;
        }
        const profiles = await fetchProfilesByIds(supabase, bans.map((b) => b.user_id));
        if (activeServerRef.current !== serverId) return;
        setServerBans(bans.map((b) => ({ ...b, profile: profiles.get(b.user_id) })));
      } catch {
        if (activeServerRef.current === serverId) setMembersLoading(false);
      }
    })();

    return channelRows;
  }, [writeMembersCache]);

  // The next member page, requested when the member list is scrolled to its
  // end. A no-op unless there is another page and nothing is in flight.
  const loadMoreMembers = useCallback(async () => {
    const serverId = activeServerRef.current;
    if (!serverId || loadingMoreMembersRef.current || !membersHasMoreRef.current) return;
    if (Date.now() < memberFetchBlockedUntilRef.current) return;
    loadingMoreMembersRef.current = true;
    try {
      const supabase = getSupabaseClient();
      const nextPage = memberPageRef.current + 1;
      const { data, error } = await supabase.rpc("get_server_members", {
        p_server_id: serverId,
        p_page: nextPage,
        p_page_size: MEMBER_PAGE_SIZE,
      });
      if (error) throw error;
      if (activeServerRef.current !== serverId) return;
      const rows = (data ?? []) as (ServerMember & { profile: Profile })[];
      memberPageRef.current = nextPage;
      const more = rows.length === MEMBER_PAGE_SIZE;
      const roleIdsByMember = memberRoleIdsRef.current;
      const assignableRoleIds = assignableRoleIdsRef.current;
      const seen = new Set(fullMembersRef.current.map((m) => m.user_id));
      const additions = rows
        .filter((m) => m.profile != null && !seen.has(m.user_id))
        .map((m) => ({
          ...m,
          role_ids: (roleIdsByMember.get(m.user_id) ?? []).filter((id) => assignableRoleIds.has(id)),
        }));
      if (additions.length) {
        const next = [...fullMembersRef.current, ...additions];
        fullMembersRef.current = next;
        setMembers(next);
      }
      membersHasMoreRef.current = more;
      setMembersHasMore(more);
      writeMembersCache(serverId);
    } catch {
      // Keep the "more" flag; retry after a cooldown so a failing endpoint
      // cannot loop once per scroll tick.
      memberFetchBlockedUntilRef.current = Date.now() + 5000;
    } finally {
      loadingMoreMembersRef.current = false;
    }
  }, [writeMembersCache]);

  // Settings surfaces that work across the whole roster (member management,
  // role manager) need every page, unlike the member rail. They call this on
  // open; it pages through the rest and stops early if a page fails.
  const loadAllMembers = useCallback(async () => {
    let guard = 0;
    while (membersHasMoreRef.current && guard < 25) {
      const before = fullMembersRef.current.length;
      await loadMoreMembers();
      if (fullMembersRef.current.length === before) break;
      guard += 1;
    }
  }, [loadMoreMembers]);

  const fetchChannelMessages = useCallback(async (channelId: string) => {
    const supabase = getSupabaseClient();
    // A failed fetch keeps whatever is on screen: wiping on error (or
    // replacing with a stale snapshot) is what blanked conversations until
    // you left and came back. A retry happens on the next navigation or
    // realtime event.
    try {
      const { data } = await supabase
        .from("messages")
        .select("*, author:profiles(*)")
        .eq("channel_id", channelId)
        .order("created_at", { ascending: false })
        .limit(MESSAGE_PAGE_SIZE + 1);
      if (activeChannelRef.current !== channelId) return;

      const { rows, hasMore } = paginateDescendingRows(data as (Message & { author: Profile })[] | null);
      setMessages((prev) => {
        const switching = prev.some((m) => m.channel_id !== channelId);
        if (switching || prev.length === 0) return rows;
        return mergeFetchedRows(prev, rows);
      });
      setChannelHasMore(hasMore);
      setMessagesLoading(false);

      const ids = rows.map((m) => m.id);
      const rxn = await loadReactionsForMessages(supabase, "channel", ids);
      if (activeChannelRef.current !== channelId) return;
      setMessageReactions((prev) => replaceReactionsForContext(prev, "channel", rxn));
    } catch {
      if (activeChannelRef.current !== channelId) return;
      setMessagesLoading(false);
    }
  }, []);

  // A channel switch can call this twice (the select handler and the chat
  // effect); share the first in-flight fetch instead of paying twice.
  const loadMessages = useCallback(async (channelId: string) => {
    const inflight = inflightChannelLoadsRef.current.get(channelId);
    if (inflight) return inflight;
    const run = fetchChannelMessages(channelId);
    inflightChannelLoadsRef.current.set(channelId, run);
    try {
      await run;
    } finally {
      if (inflightChannelLoadsRef.current.get(channelId) === run) {
        inflightChannelLoadsRef.current.delete(channelId);
      }
    }
  }, [fetchChannelMessages]);

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
    setMessages((prev) => capHistoryRows([...older, ...prev]).rows);
    // Keep a previous `true`: if history was ever trimmed, rows that still
    // exist in the database were dropped locally, so more is fetchable even
    // when this page hit the beginning.
    setChannelHasMore((prevHas) => hasMore || prevHas);
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

  const loadChannelContextWindow = useCallback(async (targetMessageId: string) => {
    if (!activeChannelId) return false;
    const channelId = activeChannelId;
    const supabase = getSupabaseClient();
    try {
      const { data: targetRow } = await supabase
        .from("messages")
        .select("*, author:profiles(*)")
        .eq("id", targetMessageId)
        .eq("channel_id", channelId)
        .maybeSingle();
      if (!targetRow || activeChannelRef.current !== channelId) return false;
      const targetMsg = targetRow as Message & { author: Profile };
      const ts = targetMsg.created_at;

      const beforeRes = await supabase
        .from("messages")
        .select("*, author:profiles(*)")
        .eq("channel_id", channelId)
        .lt("created_at", ts)
        .order("created_at", { ascending: false })
        .limit(25);
      const afterRes = await supabase
        .from("messages")
        .select("*, author:profiles(*)")
        .eq("channel_id", channelId)
        .gt("created_at", ts)
        .order("created_at", { ascending: true })
        .limit(25);

      if (activeChannelRef.current !== channelId) return false;
      const beforeRows = ((beforeRes.data ?? []) as (Message & { author: Profile })[]).slice().reverse();
      const afterRows = (afterRes.data ?? []) as (Message & { author: Profile })[];
      const rows = [...beforeRows, targetMsg, ...afterRows];
      const seen = new Set<string>();
      const unique = rows.filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });

      setMessages(unique);
      setChannelHasMore(beforeRows.length === 25);
      setMessagesLoading(false);
      const ids = unique.map((m) => m.id);
      const rxn = await loadReactionsForMessages(supabase, "channel", ids);
      if (activeChannelRef.current !== channelId) return false;
      setMessageReactions((prev) => replaceReactionsForContext(prev, "channel", rxn));
      return true;
    } catch {
      if (activeChannelRef.current === channelId) setMessagesLoading(false);
      return false;
    }
  }, [activeChannelId]);

  const loadDmContextWindow = useCallback(async (targetMessageId: string) => {
    if (!activeDmThreadId) return false;
    const threadId = activeDmThreadId;
    const supabase = getSupabaseClient();
    try {
      const { data: targetRow } = await supabase
        .from("dm_messages")
        .select("*, author:profiles(*)")
        .eq("id", targetMessageId)
        .eq("thread_id", threadId)
        .maybeSingle();
      if (!targetRow || activeDmRef.current !== threadId) return false;
      const targetMsg = targetRow as DmMessage & { author: Profile };
      const ts = targetMsg.created_at;

      const beforeRes = await supabase
        .from("dm_messages")
        .select("*, author:profiles(*)")
        .eq("thread_id", threadId)
        .lt("created_at", ts)
        .order("created_at", { ascending: false })
        .limit(25);
      const afterRes = await supabase
        .from("dm_messages")
        .select("*, author:profiles(*)")
        .eq("thread_id", threadId)
        .gt("created_at", ts)
        .order("created_at", { ascending: true })
        .limit(25);

      if (activeDmRef.current !== threadId) return false;
      const beforeRows = ((beforeRes.data ?? []) as (DmMessage & { author: Profile })[]).slice().reverse();
      const afterRows = (afterRes.data ?? []) as (DmMessage & { author: Profile })[];
      const rows = [...beforeRows, targetMsg, ...afterRows];
      const seen = new Set<string>();
      const unique = rows.filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });

      setDmMessages(unique);
      setDmHasMore(beforeRows.length === 25);
      setDmLoading(false);
      const ids = unique.map((m) => m.id);
      const rxn = await loadReactionsForMessages(supabase, "dm", ids);
      if (activeDmRef.current !== threadId) return false;
      setMessageReactions((prev) => replaceReactionsForContext(prev, "dm", rxn));
      return true;
    } catch {
      if (activeDmRef.current === threadId) setDmLoading(false);
      return false;
    }
  }, [activeDmThreadId]);

  const loadGroupContextWindow = useCallback(async (targetMessageId: string) => {
    if (!activeGroupChatId) return false;
    const groupId = activeGroupChatId;
    const supabase = getSupabaseClient();
    try {
      const { data: targetRow } = await supabase
        .from("group_messages")
        .select("*, author:profiles(*)")
        .eq("id", targetMessageId)
        .eq("group_id", groupId)
        .maybeSingle();
      if (!targetRow || activeGroupRef.current !== groupId) return false;
      const targetMsg = targetRow as GroupMessage & { author?: Profile | null };
      const ts = targetMsg.created_at;

      const beforeRes = await supabase
        .from("group_messages")
        .select("*, author:profiles(*)")
        .eq("group_id", groupId)
        .lt("created_at", ts)
        .order("created_at", { ascending: false })
        .limit(25);
      const afterRes = await supabase
        .from("group_messages")
        .select("*, author:profiles(*)")
        .eq("group_id", groupId)
        .gt("created_at", ts)
        .order("created_at", { ascending: true })
        .limit(25);

      if (activeGroupRef.current !== groupId) return false;
      const beforeRows = ((beforeRes.data ?? []) as (GroupMessage & { author?: Profile | null })[]).slice().reverse();
      const afterRows = (afterRes.data ?? []) as (GroupMessage & { author?: Profile | null })[];
      const rows = [...beforeRows, targetMsg, ...afterRows];
      const seen = new Set<string>();
      const unique = rows.filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });

      setGroupMessages(unique);
      setGroupHasMore(beforeRows.length === 25);
      setGroupLoading(false);
      const ids = unique.map((m) => m.id);
      const rxn = await loadReactionsForMessages(supabase, "group", ids);
      if (activeGroupRef.current !== groupId) return false;
      setMessageReactions((prev) => replaceReactionsForContext(prev, "group", rxn));
      return true;
    } catch {
      if (activeGroupRef.current === groupId) setGroupLoading(false);
      return false;
    }
  }, [activeGroupChatId]);

  const loadFriendships = useCallback(async (uid: string) => {
    const supabase = getSupabaseClient();
    const { data: raw } = await supabase
      .from("friendships")
      .select("*, requester:profiles!requester_id(*), addressee:profiles!addressee_id(*)")
      .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`);
    const rows = (raw ?? []) as unknown as (DbFriendship & { requester: Profile | null; addressee: Profile | null })[];
    setFriendships(
      rows.map((f) => ({
        ...f,
        requester: f.requester ?? undefined,
        addressee: f.addressee ?? undefined,
      })),
    );
  }, []);

  // When each conversation last had a message, for ordering the DM list.
  const loadDmThreadActivity = useCallback(async (threadIds: string[]) => {
    const supabase = getSupabaseClient();
    const activity: Record<string, string> = {};
    const { data, error } = await supabase.rpc("get_dm_thread_activity");
    if (!error) {
      for (const row of (data ?? []) as { thread_id: string; last_message_at: string | null }[]) {
        if (row.last_message_at) activity[row.thread_id] = row.last_message_at;
      }
    } else {
      // Older databases without that function: read the message timestamps.
      const { data: msgRows } = await supabase
        .from("dm_messages")
        .select("thread_id, created_at")
        .in("thread_id", threadIds)
        .order("created_at", { ascending: false });
      for (const row of (msgRows ?? []) as { thread_id: string; created_at: string }[]) {
        if (!activity[row.thread_id]) activity[row.thread_id] = row.created_at;
      }
    }
    if (Object.keys(activity).length) {
      setDmThreadActivity((prev) => mergeLatestActivity(prev, activity));
    }
  }, []);

  const loadDmThreads = useCallback(async (uid: string) => {
    const supabase = getSupabaseClient();
    // Both people's profiles come back with each conversation. This used to
    // be one profile request per conversation, hundreds on a busy account,
    // all standing between a reload and the app opening.
    const { data } = await supabase
      .from("dm_threads")
      .select("*, a:profiles!user_a(*), b:profiles!user_b(*)")
      .or(`user_a.eq.${uid},user_b.eq.${uid}`);
    const rows = (data ?? []) as unknown as (DmThread & { a: Profile | null; b: Profile | null })[];
    const withFriends = rows
      .map(({ a, b, ...thread }) => ({ ...thread, friend: thread.user_a === uid ? b : a }))
      .filter((t): t is DmThread & { friend: Profile } => !!t.friend);
    setDmThreads(withFriends);

    // Recency only orders the list, so it follows the shell instead of
    // holding it open.
    if (rows.length) void loadDmThreadActivity(rows.map((t) => t.id));

    // Returned (not just set) so callers like seedUnread can use the fresh
    // list immediately instead of a stale closure over state.
    return withFriends;
  }, [loadDmThreadActivity]);

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

  const fetchDmMessages = useCallback(async (threadId: string) => {
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
      setDmMessages((prev) => mergeFetchedRows(prev, rows));
      setDmHasMore(hasMore);
      setDmLoading(false);
      if (rows.length > 0) {
        const latest = rows.reduce((acc, m) => (m.created_at > acc ? m.created_at : acc), rows[0].created_at);
        bumpDmThreadActivity(threadId, latest);
      }
      const ids = rows.map((m) => m.id);
      const rxn = await loadReactionsForMessages(supabase, "dm", ids);
      if (activeDmRef.current !== threadId) return;
      setMessageReactions((prev) => replaceReactionsForContext(prev, "dm", rxn));
    } catch {
      if (activeDmRef.current !== threadId) return;
      setDmLoading(false);
    }
  }, [bumpDmThreadActivity]);

  // A thread switch can call this twice (the select handler and the chat
  // effect); share the first in-flight fetch instead of paying twice.
  const loadDmMessages = useCallback(async (threadId: string) => {
    const inflight = inflightDmLoadsRef.current.get(threadId);
    if (inflight) return inflight;
    const run = fetchDmMessages(threadId);
    inflightDmLoadsRef.current.set(threadId, run);
    try {
      await run;
    } finally {
      if (inflightDmLoadsRef.current.get(threadId) === run) {
        inflightDmLoadsRef.current.delete(threadId);
      }
    }
  }, [fetchDmMessages]);

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
    setDmMessages((prev) => capHistoryRows([...older, ...prev]).rows);
    setDmHasMore((prevHas) => hasMore || prevHas);
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

  const loadGroupChats = useCallback(async (uid: string) => {
    const supabase = getSupabaseClient();
    // Groups, their members and the members' profiles in one request; this
    // was three requests in a row.
    const { data } = await supabase
      .from("group_chat_members")
      .select("group:group_chats(*, members:group_chat_members(user_id, profile:profiles!user_id(*)))")
      .eq("user_id", uid);
    type Row = { group: (GroupChat & { members: { user_id: string; profile: Profile | null }[] }) | null };
    const groups = ((data ?? []) as unknown as Row[])
      .map((row) => row.group)
      .filter((g): g is NonNullable<Row["group"]> => !!g)
      .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
    setGroupChats(
      groups.map(({ members, ...g }) => ({
        ...g,
        members: members.map((m) => m.profile).filter((p): p is Profile => !!p),
      })),
    );
  }, []);

  const refreshGroupChats = useCallback(async () => {
    if (!userId) return;
    await loadGroupChats(userId);
  }, [userId, loadGroupChats]);

  const fetchGroupMessages = useCallback(async (groupId: string) => {
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
      setGroupMessages((prev) => mergeFetchedRows(prev, rows));
      setGroupHasMore(hasMore);
      setGroupLoading(false);
      const ids = rows.map((m) => m.id);
      const rxn = await loadReactionsForMessages(supabase, "group", ids);
      if (activeGroupRef.current !== groupId) return;
      setMessageReactions((prev) => replaceReactionsForContext(prev, "group", rxn));
    } catch {
      if (activeGroupRef.current !== groupId) return;
      setGroupLoading(false);
    }
  }, []);

  // A group switch can call this twice (the select handler and the chat
  // effect); share the first in-flight fetch instead of paying twice.
  const loadGroupMessages = useCallback(async (groupId: string) => {
    const inflight = inflightGroupLoadsRef.current.get(groupId);
    if (inflight) return inflight;
    const run = fetchGroupMessages(groupId);
    inflightGroupLoadsRef.current.set(groupId, run);
    try {
      await run;
    } finally {
      if (inflightGroupLoadsRef.current.get(groupId) === run) {
        inflightGroupLoadsRef.current.delete(groupId);
      }
    }
  }, [fetchGroupMessages]);

  // Keep the poll's view of the newest row current without making the poll
  // effect depend on the message arrays (which would restart its timer on
  // every insert).
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    dmMessagesRef.current = dmMessages;
  }, [dmMessages]);
  useEffect(() => {
    groupMessagesRef.current = groupMessages;
  }, [groupMessages]);

  // Catch-up poll for messages the live feed missed. New messages normally
  // arrive instantly on the per-conversation broadcast channel; while a
  // conversation is open this checks its single newest row once a second and
  // reloads the page every 10 s for edits, deletes and history. If the live
  // channel errors, it reloads the page once a second until it reconnects.
  //
  // This ran every 100 ms, with 100 ms full reloads whenever the channel
  // errored. That was about thirty times the database load of before, and
  // because a struggling database makes channels error, every open browser
  // escalated at once. On 23 October it took the database down for over an
  // hour. Keep these intervals at a second or more.
  useEffect(() => {
    if (!configured || !userId) return;
    let stopped = false;
    let timer: number | undefined;
    let fullTicks = 0;
    let checking = false;

    const reloadActive = () => {
      if (viewModeRef.current === "space" && activeChannelId) void loadMessages(activeChannelId);
      if (viewModeRef.current === "dm" && activeDmThreadId) void loadDmMessages(activeDmThreadId);
      if (viewModeRef.current === "group" && activeGroupChatId) void loadGroupMessages(activeGroupChatId);
    };

    const newestLoadedId = (rows: { id: string }[]): string | null => {
      for (let i = rows.length - 1; i >= 0; i -= 1) {
        if (!rows[i].id.startsWith("opt-")) return rows[i].id;
      }
      return null;
    };

    const checkLatest = async () => {
      if (checking) return;
      checking = true;
      try {
        const supabase = getSupabaseClient();
        const mode = viewModeRef.current;
        if (mode === "space" && activeChannelId) {
          const { data } = await supabase
            .from("messages")
            .select("*, author:profiles(*)")
            .eq("channel_id", activeChannelId)
            // A changing bound keeps the browser from serving the previous
            // poll out of its HTTP cache. Every stored message is in the past.
            .lte("created_at", new Date(Date.now() + 3_600_000).toISOString())
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (activeChannelRef.current !== activeChannelId) return;
          const row = data as (Message & { author?: Profile | null }) | null;
          if (!row || row.id === newestLoadedId(messagesRef.current)) return;
          setMessages((prev) => appendLiveMessage(prev, row, row.author ?? null));
          return;
        }
        if (mode === "dm" && activeDmThreadId) {
          const { data } = await supabase
            .from("dm_messages")
            .select("*, author:profiles(*)")
            .eq("thread_id", activeDmThreadId)
            .lte("created_at", new Date(Date.now() + 3_600_000).toISOString())
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (activeDmRef.current !== activeDmThreadId) return;
          const row = data as (DmMessage & { author?: Profile | null }) | null;
          if (!row || row.id === newestLoadedId(dmMessagesRef.current)) return;
          setDmMessages((prev) => appendLiveMessage(prev, row, row.author ?? null));
          bumpDmThreadActivity(row.thread_id, row.created_at);
          return;
        }
        if (mode === "group" && activeGroupChatId) {
          const { data } = await supabase
            .from("group_messages")
            .select("*, author:profiles(*)")
            .eq("group_id", activeGroupChatId)
            .lte("created_at", new Date(Date.now() + 3_600_000).toISOString())
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (activeGroupRef.current !== activeGroupChatId) return;
          const row = data as (GroupMessage & { author?: Profile | null }) | null;
          if (!row || row.id === newestLoadedId(groupMessagesRef.current)) return;
          setGroupMessages((prev) => appendLiveMessage(prev, row, row.author ?? null));
        }
      } catch {
        // Offline or a transient REST failure: the next tick retries, and the
        // realtime feed remains the primary path.
      } finally {
        checking = false;
      }
    };

    const POLL_MS = 1_000;
    const FULL_EVERY_TICKS = 10; // a full reload every 10 s
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      fullTicks += 1;
      if (liveFeedDownRef.current || fullTicks % FULL_EVERY_TICKS === 0) {
        reloadActive();
      } else {
        void checkLatest();
      }
    };
    const schedule = () => {
      if (stopped) return;
      timer = window.setTimeout(() => {
        tick();
        schedule();
      }, POLL_MS);
    };
    schedule();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        fullTicks = 0;
        reloadActive();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [configured, userId, activeChannelId, activeDmThreadId, activeGroupChatId, loadMessages, loadDmMessages, loadGroupMessages, bumpDmThreadActivity]);

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
    setGroupMessages((prev) => capHistoryRows([...older, ...prev]).rows);
    setGroupHasMore((prevHas) => hasMore || prevHas);
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

  const refreshProfile = useCallback(async () => {
    if (!userId) return;
    await loadProfile(userId);
  }, [userId, loadProfile]);

  const refreshAll = useCallback(async (onShellReady?: () => void) => {
    if (!userId) return;
    // Phase 1 — attention state first. Notifications, threads and unread
    // badges resolve before any message history is fetched, so a refresh
    // paints badges immediately instead of after seconds of channel loading.
    // The unread counts start now and run beside the rest.
    const unread = fetchUnreadCounts();
    const [, , , threads] = await Promise.all([
      loadProfile(userId),
      loadServers(userId),
      loadFriendships(userId),
      loadDmThreads(userId),
      loadGroupChats(userId),
      loadNotifications(userId),
      loadServerOrganization(),
    ]);

    await seedUnread(userId, threads, unread);
    onShellReady?.();

    // Phase 2 — the open conversation and server details stream in after.
    // These are independent lookups, so they run together instead of stacking
    // their round trips one behind the other.
    await Promise.all([
      activeServerId ? loadServerDetails(activeServerId) : Promise.resolve(),
      activeChannelId ? loadMessages(activeChannelId) : Promise.resolve(),
      activeDmThreadId ? loadDmMessages(activeDmThreadId) : Promise.resolve(),
      activeGroupChatId ? loadGroupMessages(activeGroupChatId) : Promise.resolve(),
    ]);
  }, [userId, activeServerId, activeChannelId, activeDmThreadId, activeGroupChatId, loadProfile, loadServers, loadFriendships, loadDmThreads, loadGroupChats, loadNotifications, loadServerOrganization, loadServerDetails, loadMessages, loadDmMessages, loadGroupMessages, seedUnread]);

  // Rebuild mention badges from durable notifications once the shell is ready,
  // and whenever the open channel changes. This is what makes a ping that
  // arrived while the app was closed still show on the space and channel.
  useEffect(() => {
    if (!userId || !dataLoaded) return;
    void refreshMentionUnread();
  }, [userId, dataLoaded, activeChannelId, viewMode, refreshMentionUnread]);

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
          const error = retryError as { name?: string; status?: number; message?: string } | null;
          if (error) {
            // Name + message only: full SDK error objects can carry tokens.
            console.warn("Session token was expired and could not be refreshed.", error.name, error.message);
          }
          session = refreshed?.session ?? (error?.name === "AuthRetryableFetchError" ? session : null);
        } else {
          // The token is still in date, so open the app now and confirm it
          // with Supabase in the background; a rejected session signs out.
          setSession(session);
          rememberSession(session);
          setReady(true);
          const { error: verifyError } = await supabase.auth.getUser();
          if (verifyError) {
            if (verifyError.name === "AuthRetryableFetchError") {
              console.warn("Could not reach Supabase to verify the session; continuing with the cached session.", verifyError.name);
            } else {
              const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
              if (refreshError) {

                if (refreshError.name === "AuthRetryableFetchError") {
                  console.warn("Could not refresh the session due to a transient error; continuing with the cached session.", refreshError.name);
                } else {
                  console.warn("Session is rejected by Supabase and could not be refreshed; signing out.", refreshError.name, refreshError.message);
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

      /*
       Keep the saved-account copy in step with token rotation.

       Supabase refresh tokens are single-use: every refresh consumes the old
       one and issues a new one, and `TOKEN_REFRESHED` arrives here. The saved
       copy was only written at sign-in, so an hour later the stored token was
       one the server had already retired — and switching away and back asked
       for the password again. That is the "occasionally" in the bug report:
       it only happened once the active session had rotated at least once.
      */
      if (s) rememberSession(s);

      if (_e === "SIGNED_IN" && s) {
        void refreshOwnBadges(s.user.id);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [configured, rememberSession]);

  // Lightweight catch-up for anything the socket missed while the tab was
  // hidden or the connection dropped: reload the open conversation plus the
  // thread/group lists and unread state. Deliberately cheaper than
  // refreshAll (no profile/servers/friendships reload) because this runs on
  // every tab switch and window focus.
  const refreshConversation = useCallback(async () => {
    const uid = sessionRef.current?.user?.id;
    if (!uid) return;
    const dmId = activeDmRef.current;
    const channelId = activeChannelRef.current;
    const groupId = activeGroupRef.current;
    await Promise.all([
      dmId ? loadDmMessages(dmId) : Promise.resolve(),
      channelId ? loadMessages(channelId) : Promise.resolve(),
      groupId ? loadGroupMessages(groupId) : Promise.resolve(),
      loadGroupChats(uid),
    ]);
    const threads = await loadDmThreads(uid);
    if (groupId) {
      clearGroupUnread(groupId);
      await markGroupReadNow(groupId);
    }
    await seedUnread(uid, threads);
  }, [loadDmMessages, loadMessages, loadGroupMessages, loadDmThreads, loadGroupChats, seedUnread]);

  useEffect(() => {
    if (!configured) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      // Coming back with a DM open means everything on screen was seen:
      // clear its badge and advance the server read cursor.
      if (viewModeRef.current === "dm" && activeDmRef.current) {
        clearDmUnread(activeDmRef.current);
        void markDmReadNow(activeDmRef.current);
      }
      if (viewModeRef.current === "group" && activeGroupRef.current) {
        clearGroupUnread(activeGroupRef.current);
        void markGroupReadNow(activeGroupRef.current);
      }
      void refreshConversation();
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
  }, [configured, refreshAll, refreshConversation]);

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
    if (!userId) {
      setRestrictions([]);
      return;
    }
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from("account_restrictions")
      .select("restriction")
      .eq("user_id", userId);
    setRestrictions((data as { restriction: string }[] | null)?.map((r) => r.restriction) ?? []);
  }, [userId]);

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
    bootTimingRef.current = { startedAt: performance.now() };

    void (async () => {
      try {
        // Creating the profile row only matters for a brand-new account; it
        // runs alongside the load instead of in front of it, and the profile
        // is read again below if it wasn't there yet.
        const ensured = ensureProfile(userId, user?.email);
        // Open straight into the last-known shell when there is one. The load
        // below refreshes all of it a moment later.
        const boot = readBootSnapshot(userId);
        if (boot && !cancelled) {
          if (boot.profile) setProfile(boot.profile);
          setServers(boot.servers);
          setServerFolders(boot.serverFolders);
          setServerListState(boot.serverListState);
          setDmThreads(boot.dmThreads);
          setDmThreadActivity((prev) => mergeLatestActivity(prev, boot.dmThreadActivity));
          setFriendships(boot.friendships);
          setGroupChats(boot.groupChats);
          setNotifications(boot.notifications);
          imagesWarmedRef.current = true;
          bootTimingRef.current.fromSnapshot = true;
          setDataLoaded(true);
          setHydrated(true);
        }
        // Paint last-known badges/notifications instantly so a refresh never
        // shows a clean slate while the network catches up. refreshAll
        // overwrites all of this with server truth moments later.
        const snapshot = typeof window !== "undefined" ? readUnreadSnapshot(userId) : null;
        if (snapshot && !cancelled) {
          if (snapshot.dm.length > 0) {
            setDmUnreadMap(
              new Map(
                snapshot.dm.map((d) => [
                  d.threadId,
                  {
                    friend: {
                      id: d.friendId,
                      display_name: d.displayName,
                      username: d.username,
                      avatar_url: d.avatarUrl,
                    } as Profile,
                    count: d.count,
                    latestAt: d.latestAt,
                  },
                ]),
              ),
            );
          }
          if (snapshot.group.length > 0) {
            setGroupUnreadMap(new Map(snapshot.group.map((g) => [g.id, g.count])));
          }
          if (snapshot.notifications.length > 0) {
            setNotifications(snapshot.notifications);
          }
        }
        await Promise.all([
          ensured,
          // The shell opens once the profile is in too, so forms that seed
          // from it (Settings → Profiles) never start out blank.
          refreshAll(() => { void ensured.then(() => { if (!cancelled) setDataLoaded(true); }); }),
        ]);
        if (!profileRef.current) await loadProfile(userId);
        if (!cancelled) {
          bootTimingRef.current.freshAt = performance.now();
          reportBootTiming();
        }
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

    // Your picture and the space icons are what the first screen shows. Give
    // them a moment to land, but never hold the app for them; every other
    // avatar loads as it scrolls into view.
    const urls: (string | null | undefined)[] = [profile?.avatar_url, ...servers.map((s) => s.icon_url)];
    void Promise.race([preloadImages(urls), new Promise((r) => setTimeout(r, 250))]).finally(() => setHydrated(true));
  }, [dataLoaded, hydrated, profile, servers]);

  useEffect(() => {
    if (!hydrated || bootTimingRef.current.shownAt !== undefined) return;
    bootTimingRef.current.shownAt = performance.now();
    reportBootTiming();
  }, [hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the saved shell current for the next load: shortly after this one,
  // then every minute, and whenever the tab is hidden or closed.
  const bootStateRef = useRef<{ uid: string; state: BootState } | null>(null);
  useEffect(() => {
    if (!dataLoaded || !userId || profile?.id !== userId) return;
    bootStateRef.current = {
      uid: userId,
      state: {
        profile,
        servers,
        serverFolders,
        serverListState,
        dmThreads,
        dmThreadActivity,
        friendships,
        groupChats,
        notifications: notifications.slice(0, 30),
      },
    };
  }, [dataLoaded, userId, profile, servers, serverFolders, serverListState, dmThreads, dmThreadActivity, friendships, groupChats, notifications]);

  useEffect(() => {
    if (!userId) return;
    const save = () => {
      const current = bootStateRef.current;
      if (signingOutRef.current || !current || current.uid !== userId || sessionRef.current?.user.id !== userId) return;
      writeBootSnapshot(userId, current.state);
    };
    const onVisibility = () => { if (document.visibilityState === "hidden") save(); };
    const first = window.setTimeout(save, 5_000);
    const every = window.setInterval(save, 60_000);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", save);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", save);
    };
  }, [userId]);

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
          scheduleMentionRefresh();
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
      void notifSub.unsubscribe();
      void friendSub.unsubscribe();
      void notesSub.unsubscribe();
    };
  }, [userId, configured, loadFriendships, scheduleMentionRefresh]);

  // Catalyst counts follow only this user's servers plus their own grants.
  // This used to be one unfiltered server_catalysts subscription, and that
  // table is world-readable — so every purchase or grant by anyone, anywhere
  // fanned out to every connected client and refetched here.
  useEffect(() => {
    if (!userId || !configured) return;
    const supabase = getSupabaseClient();
    const reload = () => void refreshCatalysts(serversRef.current.map((s) => s.id), userId);
    const ch = supabase.channel(`catalysts:${userId}`);
    for (const s of serversRef.current) {
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "server_catalysts", filter: `server_id=eq.${s.id}` },
        reload,
      );
    }
    ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "server_catalysts", filter: `user_id=eq.${userId}` },
      reload,
    );
    ch.subscribe();
    return () => { void ch.unsubscribe(); };
  }, [userId, configured, servers.map((s) => s.id).join(","), refreshCatalysts]);

  const friendIdsKey = friends.map((f) => f.id).sort().slice(0, 200).join(",");
  useEffect(() => {
    if (!userId || !configured || friendIdsKey === "") return;
    const sub = getSupabaseClient().channel(`profiles:friends:${userId}`);
    // Realtime rejects an `in` filter over 100 values, and the rejection
    // took the whole subscription down for anyone with 101+ friends.
    const ids = friendIdsKey.split(",");
    for (let i = 0; i < ids.length; i += 100) {
      sub.on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=in.(${ids.slice(i, i + 100).join(",")})` },
        () => void loadFriendships(userId),
      );
    }
    sub.subscribe();
    return () => {
      void sub.unsubscribe();
    };
  }, [userId, configured, friendIdsKey, loadFriendships]);

  useEffect(() => {
    if (!activeChannelId || !configured || !userId) return;
    liveFeedDownRef.current = false;
    void loadMessages(activeChannelId);
    const supabase = getSupabaseClient();
    // Self-healing live feed. Each subscription gets its own topic: reusing
    // the bare name while the previous instance was still leaving let that
    // leave tear the new one down, so after a reload (e.g. returning to the
    // tab) messages stopped arriving until you switched conversations. A
    // dropped or timed-out channel now resubscribes and catches up.
    let disposed = false;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let sub: RealtimeChannel;
    const connect = () => {
    sub = supabase
      .channel(`msg:${activeChannelId}:${Math.random().toString(36).slice(2, 10)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${activeChannelId}` },
        (payload) => {
          const msg = payload.new as Message;

          if (activeChannelRef.current !== activeChannelId) return;
          void resolveLiveAuthor(msg.author_id).then((author) => {
            if (activeChannelRef.current !== activeChannelId) return;
            setMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;
              const withoutDupes = prev.filter(
                (m) => !(m.id.startsWith("opt-") && matchesOptimisticRow(m, msg)),
              );
              // Never drop a live message: when the author lookup fails the
              // row still renders (the name falls back to "Unknown") and the
              // author fills in on the next reload.
              return [...withoutDupes, { ...msg, author: author ?? fallbackAuthor(msg.author_id) }];
            });
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages" },
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
      .subscribe((status) => {
        if (disposed) return;
        if (status === "SUBSCRIBED") {
          liveFeedDownRef.current = false;
          // Rejoined after a drop: fetch whatever arrived while we were gone.
          if (attempt > 0) void loadMessages(activeChannelId);
          attempt = 0;
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          liveFeedDownRef.current = true;
          void supabase.removeChannel(sub);
          retry = setTimeout(connect, Math.min(30_000, 1000 * 2 ** attempt++));
        }
      });
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      void supabase.removeChannel(sub);
    };
  }, [activeChannelId, configured, userId, loadMessages, resolveLiveAuthor]);

  useEffect(() => {
    if (!activeDmThreadId || !configured || !userId) return;
    liveFeedDownRef.current = false;
    void loadDmMessages(activeDmThreadId);
    const supabase = getSupabaseClient();
    // Self-healing live feed. Each subscription gets its own topic: reusing
    // the bare name while the previous instance was still leaving let that
    // leave tear the new one down, so after a reload (e.g. returning to the
    // tab) messages stopped arriving until you switched conversations. A
    // dropped or timed-out channel now resubscribes and catches up.
    let disposed = false;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let sub: RealtimeChannel;
    const connect = () => {
    sub = supabase
      .channel(`dm:${activeDmThreadId}:${Math.random().toString(36).slice(2, 10)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "dm_messages", filter: `thread_id=eq.${activeDmThreadId}` },
        (payload) => {
          const msg = payload.new as DmMessage;

          if (msg.thread_id !== activeDmRef.current) return;
          void resolveLiveAuthor(msg.author_id).then((author) => {
            if (msg.thread_id !== activeDmRef.current) return;
            setDmMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;
              const withoutDupes = prev.filter(
                (m) => !(m.id.startsWith("opt-") && matchesOptimisticRow(m, msg)),
              );
              // Never drop a live message: when the author lookup fails the
              // row still renders (the name falls back to "Unknown") and the
              // author fills in on the next reload.
              return [...withoutDupes, { ...msg, author: author ?? fallbackAuthor(msg.author_id) }];
            });
            bumpDmThreadActivity(msg.thread_id, msg.created_at);
            if (msg.author_id !== userId) {
              // Same fallback as the row above: a failed lookup must not
              // swallow the unread badge or the notification either.
              const effectiveAuthor = author ?? fallbackAuthor(msg.author_id);

              if (isAppInBackground()) {
                // Tab hidden or app unfocused: this message was NOT seen.
                // Never mark it read — count it unread so the badge (and a
                // refresh) keeps it. The alert below still fires through the
                // background rule.
                setDmUnreadMap((prev) => {
                  const next = new Map(prev);
                  const cur = next.get(msg.thread_id);
                  next.set(msg.thread_id, {
                    friend: effectiveAuthor,
                    count: (cur?.count ?? 0) + 1,
                    latestAt: msg.created_at,
                  });
                  return next;
                });
              } else {
                void markDmReadNow(msg.thread_id);
              }
              alertIncomingDm(
                displayName(effectiveAuthor),
                msg.content.slice(0, 120) || undefined,
                profileRef.current,
                msg.thread_id,
              );
            }
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "dm_messages" },
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
      .subscribe((status) => {
        if (disposed) return;
        if (status === "SUBSCRIBED") {
          liveFeedDownRef.current = false;
          // Rejoined after a drop: fetch whatever arrived while we were gone.
          if (attempt > 0) void loadDmMessages(activeDmThreadId);
          attempt = 0;
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          liveFeedDownRef.current = true;
          void supabase.removeChannel(sub);
          retry = setTimeout(connect, Math.min(30_000, 1000 * 2 ** attempt++));
        }
      });
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      void supabase.removeChannel(sub);
    };
  }, [activeDmThreadId, configured, userId, loadDmMessages, bumpDmThreadActivity, resolveLiveAuthor]);

  useEffect(() => {
    if (!activeGroupChatId || !configured || !userId) return;
    liveFeedDownRef.current = false;
    void loadGroupMessages(activeGroupChatId);
    const supabase = getSupabaseClient();
    // Self-healing live feed. Each subscription gets its own topic: reusing
    // the bare name while the previous instance was still leaving let that
    // leave tear the new one down, so after a reload (e.g. returning to the
    // tab) messages stopped arriving until you switched conversations. A
    // dropped or timed-out channel now resubscribes and catches up.
    let disposed = false;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let sub: RealtimeChannel;
    const connect = () => {
    sub = supabase
      .channel(`group:${activeGroupChatId}:${Math.random().toString(36).slice(2, 10)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "group_messages", filter: `group_id=eq.${activeGroupChatId}` },
        (payload) => {
          const msg = payload.new as GroupMessage;

          if (msg.group_id !== activeGroupRef.current) return;
          if (document.visibilityState === "visible") {
            clearGroupUnread(msg.group_id);
            void markGroupReadNow(msg.group_id);
          }
          if (msg.author_id == null) {
            setGroupMessages((prev) =>
              prev.some((m) => m.id === msg.id) ? prev : [...prev, { ...msg }],
            );
            return;
          }
          void resolveLiveAuthor(msg.author_id).then((author) => {
            if (msg.group_id !== activeGroupRef.current) return;
            setGroupMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;
              const withoutDupes = prev.filter(
                (m) => !(m.id.startsWith("opt-") && matchesOptimisticRow(m, msg)),
              );
              // Never drop a live message: when the author lookup fails the
              // row still renders (the name falls back to "Unknown") and the
              // author fills in on the next reload.
              return [...withoutDupes, { ...msg, author: author ?? fallbackAuthor(msg.author_id) }];
            });
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "group_messages" },
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
      .subscribe((status) => {
        if (disposed) return;
        if (status === "SUBSCRIBED") {
          liveFeedDownRef.current = false;
          // Rejoined after a drop: fetch whatever arrived while we were gone.
          if (attempt > 0) void loadGroupMessages(activeGroupChatId);
          attempt = 0;
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          liveFeedDownRef.current = true;
          void supabase.removeChannel(sub);
          retry = setTimeout(connect, Math.min(30_000, 1000 * 2 ** attempt++));
        }
      });
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      void supabase.removeChannel(sub);
    };
  }, [activeGroupChatId, configured, userId, loadGroupMessages, resolveLiveAuthor]);

  // Postgres Changes is delivered on the Realtime server's CDC poll (about a
  // second), so the live feed alone still feels late. A database trigger also
  // broadcasts each insert on a private per-conversation topic; that arrives
  // over the already-open websocket immediately. CDC and the 100 ms poll stay
  // as fallbacks, and every path dedupes by message id.
  useEffect(() => {
    if (!configured || !userId) return;
    let topic: string | null = null;
    let kind: "channel" | "dm" | "group" | null = null;
    if (viewMode === "space" && activeChannelId) {
      topic = `messages:ch:${activeChannelId}`;
      kind = "channel";
    } else if (viewMode === "dm" && activeDmThreadId) {
      topic = `messages:dm:${activeDmThreadId}`;
      kind = "dm";
    } else if (viewMode === "group" && activeGroupChatId) {
      topic = `messages:group:${activeGroupChatId}`;
      kind = "group";
    }
    if (!topic || !kind) return;

    const channelTopic = topic;
    const supabase = getSupabaseClient();
    let disposed = false;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let sub: RealtimeChannel;
    const connect = () => {
      if (disposed) return;
      const channel = supabase.channel(channelTopic, {
        config: { private: true, broadcast: { self: false } },
      });
      sub = channel;
      channel.on("broadcast", { event: "INSERT" }, ({ payload }) => {
        const data = payload as { record?: Record<string, unknown>; author?: Profile | null };
        const record = data.record;
        if (!record || typeof record.id !== "string") return;
        const author = data.author ?? null;
        if (kind === "channel") {
          if (activeChannelRef.current !== activeChannelId) return;
          const row = record as unknown as Message;
          if (row.channel_id !== activeChannelId) return;
          setMessages((prev) => appendLiveMessage(prev, row, author));
          return;
        }
        if (kind === "dm") {
          if (activeDmRef.current !== activeDmThreadId) return;
          const row = record as unknown as DmMessage;
          if (row.thread_id !== activeDmThreadId) return;
          setDmMessages((prev) => appendLiveMessage(prev, row, author));
          return;
        }
        if (activeGroupRef.current !== activeGroupChatId) return;
        const row = record as unknown as GroupMessage;
        if (row.group_id !== activeGroupChatId) return;
        setGroupMessages((prev) => appendLiveMessage(prev, row, author));
        setGroupChats((prev) => prev.map((g) => (g.id === row.group_id ? { ...g, last_message_at: row.created_at } : g)));
      });
      channel.subscribe((status) => {
        if (disposed || sub !== channel) return;
        if (status === "SUBSCRIBED") {
          attempt = 0;
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          void supabase.removeChannel(channel);
          retry = setTimeout(connect, Math.min(30_000, 1000 * 2 ** attempt++));
        }
      });
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      void supabase.removeChannel(sub);
    };
  }, [configured, userId, viewMode, activeChannelId, activeDmThreadId, activeGroupChatId]);

  useEffect(() => {
    if (!userId || !configured || groupChats.length === 0) return;
    const supabase = getSupabaseClient();
    // One channel with a binding per group, not one channel per group:
    // N groups used to hold N sockets for the same table.
    const ch = supabase.channel(`gcm:${userId}`);
    for (const g of groupChats) {
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_chat_members", filter: `group_id=eq.${g.id}` },
        () => void loadGroupChats(userId),
      );
    }
    ch.subscribe();
    return () => { void ch.unsubscribe(); };
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
    // Those tables aren't in the Realtime publication (table change feeds on
    // a 13,000-member space were most of the database timeouts), so a
    // statement-level trigger sends one "roster" ping per change (0189).
    // Pings are coalesced: a burst of joins becomes one refresh.
    let timer: ReturnType<typeof setTimeout> | null = null;
    let last = 0;
    const MIN_GAP_MS = 4000;
    const refresh = () => {
      if (timer) return;
      const wait = Math.max(300, last + MIN_GAP_MS - Date.now());
      timer = setTimeout(() => {
        timer = null;
        last = Date.now();
        setRosterVersion((v) => v + 1);
        void loadServerDetails(activeServerId, { refreshMembers: true });
      }, wait);
    };
    const sub = supabase
      .channel(`server-roster:${activeServerId}`, { config: { broadcast: { self: true } } })
      .on("broadcast", { event: "roster" }, refresh)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(sub);
    };
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
    // Same consolidation as the member watcher above: one channel, a binding
    // per group, instead of a socket per group.
    const ch = supabase.channel(`gcp:${userId}`);
    for (const g of groupChats) {
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_call_presence", filter: `group_id=eq.${g.id}` },
        () => void loadCounts(),
      );
    }
    ch.subscribe();
    return () => { void ch.unsubscribe(); };
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
          // Single writer for own-profile updates (a second subscription
          // used to refetch the whole row here too — double work per event).
          // Keep the 5-minute cache coherent as well so a later loadProfile
          // never flashes the pre-update row.
          const updated = payload.new as Profile;
          patchProfileInState(updated);
          setCache(`profile:${userId}`, updated);
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
          const inActiveDmChat =
            viewModeRef.current === "dm" && activeDmRef.current === msg.thread_id;

          // The always-on feed also paints the open thread. This is the path
          // that still delivers instantly while a conversation's own channel
          // is being torn down and re-subscribed during a switch.
          if (inActiveDmChat) {
            void resolveLiveAuthor(msg.author_id).then((author) => {
              if (viewModeRef.current !== "dm" || activeDmRef.current !== msg.thread_id) return;
              setDmMessages((prev) => {
                if (prev.some((m) => m.id === msg.id)) return prev;
                const withoutDupes = prev.filter(
                  (m) => !(m.id.startsWith("opt-") && matchesOptimisticRow(m, msg)),
                );
                return [...withoutDupes, { ...msg, author: author ?? fallbackAuthor(msg.author_id) }];
              });
              bumpDmThreadActivity(msg.thread_id, msg.created_at);
            });
          }

          if (msg.author_id === userId) return;
          if (inActiveDmChat) return;
          // An ignored message request stays silent.
          if (dmThreadsRef.current.some((t) => t.id === msg.thread_id && t.request_ignored_at && !t.accepted_at)) return;

          void (async () => {
            const author = await resolveLiveAuthor(msg.author_id);
            if (!author) return;
            // A new message from them brings a closed DM row back, with history.
            setClosedDmFriendIds((prev) => {
              if (!prev.includes(author.id)) return prev;
              const next = prev.filter((id) => id !== author.id);
              try {
                window.localStorage.setItem(CLOSED_DMS_PREFIX + userId, JSON.stringify(next));
              } catch {
                // Non-fatal: the row is back for this session regardless.
              }
              return next;
            });
            setDmUnreadMap((prev) => {
              const next = new Map(prev);
              const cur = next.get(msg.thread_id);
              next.set(msg.thread_id, {
                friend: author,
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
              displayName(author),
              msg.content.slice(0, 120) || undefined,
              profileRef.current,
              msg.thread_id,
            );
          })();
        },
      )
      .subscribe();
    return () => { void sub.unsubscribe(); };
  }, [userId, configured, bumpDmThreadActivity, loadDmThreads, resolveLiveAuthor]);

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
          const channel = channelsRef.current.find((c) => c.id === msg.channel_id);
          const viewingChannel =
            viewModeRef.current === "space" && activeChannelRef.current === msg.channel_id;

          // Always-on second delivery path for the open channel. The
          // per-channel feed handles the same insert; the message id makes
          // that idempotent, and this path survives a channel switch.
          if (viewingChannel) {
            void resolveLiveAuthor(msg.author_id).then((author) => {
              if (viewModeRef.current !== "space" || activeChannelRef.current !== msg.channel_id) return;
              setMessages((prev) => {
                if (prev.some((m) => m.id === msg.id)) return prev;
                const withoutDupes = prev.filter(
                  (m) => !(m.id.startsWith("opt-") && matchesOptimisticRow(m, msg)),
                );
                return [...withoutDupes, { ...msg, author: author ?? fallbackAuthor(msg.author_id) }];
              });
            });
          }

          if (msg.author_id === userId) return;
          if (channel && !viewingChannel) {
            setChannelUnreadMap((prev) => {
              const next = new Map(prev);
              next.set(msg.channel_id, (next.get(msg.channel_id) ?? 0) + 1);
              return next;
            });
            setServerIndicators((prev) => new Set(prev).add(channel.server_id));
          }
          if (msg.mentions?.includes(userId)) return;
          if (!channel) return;
          void resolveLiveAuthor(msg.author_id).then((author) => {
            if (!author) return;
            notifyUser(
              `#${channel.name}`,
              `${displayName(author)}: ${msg.content.slice(0, 120)}`,
              { kind: "channel", channelId: msg.channel_id },
            );
          });
        },
      )
      .subscribe();
    return () => { void sub.unsubscribe(); };
  }, [userId, configured, resolveLiveAuthor]);

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
          const activeGroup =
            viewModeRef.current === "group" && activeGroupRef.current === msg.group_id;

          // Always-on second delivery path for the open group. The group's own
          // channel handles the same insert; the message id makes it
          // idempotent, and this path survives a channel switch.
          if (activeGroup) {
            if (msg.author_id == null) {
              setGroupMessages((prev) =>
                prev.some((m) => m.id === msg.id) ? prev : [...prev, { ...msg }],
              );
            } else {
              void resolveLiveAuthor(msg.author_id).then((author) => {
                if (viewModeRef.current !== "group" || activeGroupRef.current !== msg.group_id) return;
                setGroupMessages((prev) => {
                  if (prev.some((m) => m.id === msg.id)) return prev;
                  const withoutDupes = prev.filter(
                    (m) => !(m.id.startsWith("opt-") && matchesOptimisticRow(m, msg)),
                  );
                  return [...withoutDupes, { ...msg, author: author ?? fallbackAuthor(msg.author_id) }];
                });
              });
            }
          }

          if (msg.author_id === userId) return;
          if (msg.mentions?.includes(userId)) return;
          const group = groupChatsRef.current.find((g) => g.id === msg.group_id);
          if (!group) return;

          if (activeGroup && document.visibilityState === "visible") {
            clearGroupUnread(msg.group_id);
            void markGroupReadNow(msg.group_id);
          } else {
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
  }, [userId, configured, resolveLiveAuthor]);

  const signIn = useCallback(async (email: string, password: string, turnstileToken?: string | null) => {
    // Pre-gate: per-IP/email rate limit + VPN/proxy check (login only —
    // saved sessions and active sessions are never re-checked). Flagged egress
    // answers TURNSTILE_REQUIRED and the caller re-runs us with a token.
    try {
      const gate = await apiFetch("/api/auth/login-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          ...(turnstileToken ? { turnstileToken } : {}),
        }),
      });
      if (!gate.ok) {
        const json = (await gate.json().catch(() => null)) as { error?: string; code?: string } | null;
        // Control-flow sentinel: the auth screen reveals the Turnstile widget
        // and resubmits. Never shown to the user.
        if (json?.code === "TURNSTILE_REQUIRED") return TURNSTILE_REQUIRED;
        return json?.error ?? "Sign-in is temporarily blocked. Try again later.";
      }
    } catch {
      // Fail-open on network error here: the server gate itself is
      // fail-closed when reachable, but a client that can't reach the
      // API at all can't sign in anyway.
    }
    // No signOut()/resetSupabaseClient() before the attempt. auth-js
    // 2.108.2's signOut always issues an admin revoke — even for scope
    // "local" — so tearing down first revoked the OUTGOING account's
    // server session: its saved refresh token died, switching back to it
    // demanded the password again, and because the teardown ran before
    // the password was ever checked, one failed attempt also signed you
    // out of the account you were already using. A wrong password now has
    // zero side effects; on success signInWithPassword swaps the session
    // and the userId effect reloads the profile for the new user.
    const { data, error } = await getSupabaseClient().auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) return mapAuthError(error.message);
    if (data.session) rememberSession(data.session);
    await refreshMfaStatus();
    return null;
  }, [refreshMfaStatus, rememberSession]);

  const signUp = useCallback(async (email: string, password: string, username: string, referralCode?: string | null, turnstileToken?: string | null, birthdate?: string | null): Promise<SignUpResult> => {
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
        // Parsed defensively. The gate answers JSON, but the things in front
        // of it — an edge runtime timing out, a proxy 502, a WAF challenge —
        // answer HTML, and `.json()` throwing on that used to fall through to
        // the catch below and report a connection problem to someone whose
        // connection was fine. The status is what we actually know, so say
        // something true from it when there is no message to quote.
        const json = (await checkRes.json().catch(() => null)) as { error?: string } | null;
        if (json?.error) return { error: json.error };
        if (checkRes.status === 429) {
          return { error: "Too many sign-up attempts from your network. Try again later." };
        }
        if (checkRes.status >= 500) {
          return { error: "Sign-up is temporarily unavailable. Please try again in a few minutes." };
        }
        return { error: "Account creation is not allowed right now." };
      }
    } catch {
      // Only a genuine transport failure reaches here now, so the connection
      // advice is finally accurate when it is given.
      return { error: "We couldn't reach Disband to check this sign-up. Check your connection and try again." };
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: {
          username: normalized,
          display_name: displayNameVal,

          ...(birthdate ? { birthdate } : {}),
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

  // --- Anonymous (throwaway) accounts --------------------------------------
  // The 16-digit number is the credential. Registration and login both return
  // a server-minted session, which we install with setSession so the normal
  // auth-state effect loads the profile/servers/etc. exactly like a password
  // sign-in.
  const registerAnonymousAccount = useCallback(
    async (tier: AnonTier, turnstileToken?: string | null): Promise<AnonAuthResult> => {
      try {
        const res = await apiFetch("/api/auth/anon/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tier, ...(turnstileToken ? { turnstileToken } : {}) }),
        });
        const json = (await res.json().catch(() => null)) as AnonAuthResult | null;
        if (!res.ok) {
          if (json?.code === TURNSTILE_REQUIRED) return { code: TURNSTILE_REQUIRED, error: json.error };
          return { error: json?.error ?? "Could not create the account. Try again." };
        }
        // Deliberately NOT signing in here: the caller has to show the account
        // number once, and setting the session would swap the whole app shell
        // in and unmount the reveal. The session rides along in the result and
        // is installed by adoptAnonymousSession once the user confirms.
        return json ?? { error: "Could not create the account. Try again." };
      } catch {
        return { error: "We couldn't reach Disband. Check your connection and try again." };
      }
    },
    [],
  );

  const adoptAnonymousSession = useCallback(
    async (payload: AnonSessionPayload): Promise<string | null> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.setSession(payload);
      if (error || !data.session) return "Sign-in failed. Try again.";
      rememberSession(data.session);
      await refreshMfaStatus();
      return null;
    },
    [refreshMfaStatus, rememberSession],
  );

  const loginAnonymousAccount = useCallback(
    async (accountNumber: string, turnstileToken?: string | null): Promise<AnonAuthResult> => {
      try {
        const res = await apiFetch("/api/auth/anon/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            number: normalizeAccountNumber(accountNumber),
            ...(turnstileToken ? { turnstileToken } : {}),
          }),
        });
        const json = (await res.json().catch(() => null)) as AnonAuthResult | null;
        if (!res.ok) {
          if (json?.code === TURNSTILE_REQUIRED) return { code: TURNSTILE_REQUIRED, error: json.error };
          return { error: json?.error ?? "Could not sign in. Try again." };
        }
        if (json?.status === "expired") return json;
        if (json?.session) {
          const { error } = await getSupabaseClient().auth.setSession(json.session);
          if (error) return { error: "Sign-in failed. Try again." };
          return { ok: true };
        }
        return { error: "Could not sign in. Try again." };
      } catch {
        return { error: "We couldn't reach Disband. Check your connection and try again." };
      }
    },
    [],
  );

  const exportAnonymousData = useCallback(
    async (accountNumber: string, turnstileToken?: string | null): Promise<AnonAuthResult> => {
      try {
        const res = await apiFetch("/api/auth/anon/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            number: normalizeAccountNumber(accountNumber),
            ...(turnstileToken ? { turnstileToken } : {}),
          }),
        });
        if (!res.ok) {
          const json = (await res.json().catch(() => null)) as AnonAuthResult | null;
          if (json?.code === TURNSTILE_REQUIRED) return { code: TURNSTILE_REQUIRED, error: json.error };
          return { error: json?.error ?? "Could not prepare your download. Try again." };
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `disband-anonymous-export-${normalizeAccountNumber(accountNumber).slice(-4)}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        return { ok: true };
      } catch {
        return { error: "We couldn't reach Disband. Check your connection and try again." };
      }
    },
    [],
  );

  const purgeAnonymousAccount = useCallback(
    async (accountNumber: string, turnstileToken?: string | null): Promise<AnonAuthResult> => {
      try {
        const res = await apiFetch("/api/auth/anon/purge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            number: normalizeAccountNumber(accountNumber),
            ...(turnstileToken ? { turnstileToken } : {}),
          }),
        });
        const json = (await res.json().catch(() => null)) as AnonAuthResult | null;
        if (!res.ok) {
          if (json?.code === TURNSTILE_REQUIRED) return { code: TURNSTILE_REQUIRED, error: json.error };
          return { error: json?.error ?? "Could not purge the account. Try again." };
        }
        return { ok: true, purged: true };
      } catch {
        return { error: "We couldn't reach Disband. Check your connection and try again." };
      }
    },
    [],
  );

  const requestAccountDeletion = useCallback(async (): Promise<{ ok?: boolean; error?: string; instant?: boolean; cancel_until?: string; purge_at?: string }> => {
    try {
      const res = await apiFetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok) return { error: (json?.error as string) ?? "Could not start deletion. Try again." };
      return { ok: true, instant: json?.instant as boolean, cancel_until: json?.cancel_until as string, purge_at: json?.purge_at as string };
    } catch {
      return { error: "We couldn't reach Disband. Check your connection and try again." };
    }
  }, []);

  const cancelAccountDeletion = useCallback(async (): Promise<{ ok?: boolean; error?: string }> => {
    try {
      const res = await apiFetch("/api/account/cancel-deletion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok) return { error: (json?.error as string) ?? "Could not cancel deletion." };
      return { ok: true };
    } catch {
      return { error: "We couldn't reach Disband. Check your connection and try again." };
    }
  }, []);

  // Auto-cancel a pending deletion if the owner logs back in within the
  // 24-hour window (see migration 0126).
  const cancelDeletionInFlight = useRef(false);
  useEffect(() => {
    const profileAny = profile as {
      deletion_requested_at?: string | null;
      deletion_cancel_until?: string | null;
    } | null;
    if (!profileAny?.deletion_requested_at || !profileAny?.deletion_cancel_until) return;
    if (cancelDeletionInFlight.current) return;
    if (Date.parse(profileAny.deletion_cancel_until) <= Date.now()) return;
    cancelDeletionInFlight.current = true;
    void cancelAccountDeletion().finally(() => {
      cancelDeletionInFlight.current = false;
    });
  }, [profile]);

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
      try { window.localStorage.removeItem(BOOT_SNAPSHOT_PREFIX + userId); } catch { /* ignore */ }
      await getSupabaseClient().from("profiles").update({ status: "offline", listening: null, activity: null }).eq("id", userId);
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
    const supabase = getSupabaseClient();

    // 1. Bank the account we are leaving. Read the live session from the
    //    client rather than React state: storage is updated on every token
    //    rotation, state is not, and saving a retired refresh token here is
    //    what made switching back ask for a password.
    const { data: live } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
    const leaving = live.session ?? sessionRef.current;
    if (leaving) rememberSession(leaving);
    if (leaving?.user?.id === account.user_id) return null;

    // 2. Mint a session for the target on a throwaway client, so a rejected
    //    token can never disturb the account we are still signed in to.
    const candidates = [
      getSavedRefreshToken(account.user_id),
      getSavedSessionTokens(account.user_id)?.refresh_token ?? null,
    ].filter((t, i, all): t is string => !!t && all.indexOf(t) === i);

    let expired = candidates.length === 0;
    for (const token of candidates) {
      const result = await exchangeRefreshToken(token);
      if ("error" in result) {
        expired = expired || result.expired;
        continue;
      }
      if (result.session.user?.id !== account.user_id) continue;
      // The exchange already rotated the token: save the new one before
      // anything else can fail, or this account is lost for good.
      saveSwitchRefreshToken(account.user_id, result.session.refresh_token);

      // 3. Only now hand the known-good session to the real client.
      const { data, error } = await supabase.auth.setSession({
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token,
      });
      if (error || !data.session) {
        // Put the account we were on back exactly as it was.
        if (leaving) await supabase.auth.setSession({ access_token: leaving.access_token, refresh_token: leaving.refresh_token }).catch(() => undefined);
        return "Couldn't switch accounts. Check your connection and try again.";
      }
      resetRefreshState();
      setSession(data.session);
      rememberSession(data.session);
      return null;
    }

    if (expired) {
      // The server rejected every token we hold, so it is gone for good:
      // forget it and let the person sign in once more.
      clearSavedRefreshToken(account.user_id);
      clearSavedSessionTokens(account.user_id);
      return "This account was signed out. Sign in to it once more to keep it in the switcher.";
    }
    return "Couldn't reach Disband to switch accounts. Try again in a moment.";
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
    try {
      const { error } = await getSupabaseClient().from("profiles").update(payload).eq("id", userId);
      if (error) {
        await loadProfile(userId);
        return mapProfileError(error.message, error.code);
      }
      await loadProfile(userId);
      return null;
    } catch (err) {
      await loadProfile(userId);
      return err instanceof Error ? err.message : "Couldn't save your profile.";
    }
  }, [userId, profile, patchProfileInState, loadProfile, trackPresence]);

  // Record the space on screen as it stands, once its own rows are in (the
  // previous space's channels and roster linger until the new ones land).
  useEffect(() => {
    const serverId = activeServerId;
    if (!serverId || viewMode !== "space") return;
    if (channels.length === 0 || channels.some((c) => c.server_id !== serverId)) return;
    const prev = spaceSnapshotsRef.current.get(serverId);
    const ownMembers = members.length > 0 && members.every((m) => m.server_id === serverId);
    const ownRoles = serverRoles.length > 0 && serverRoles.every((r) => r.server_id === serverId);
    const channelIds = new Set(channels.map((c) => c.id));
    const effects: Record<string, ChannelEffects> = {};
    for (const [id, e] of Object.entries(channelEffects)) if (channelIds.has(id)) effects[id] = e;
    rememberRecent(spaceSnapshotsRef.current, serverId, {
      categories,
      channels,
      members: ownMembers ? members : prev?.members ?? [],
      membersHasMore: ownMembers ? membersHasMore : prev?.membersHasMore ?? false,
      roles: ownRoles ? serverRoles : prev?.roles ?? [],
      permissions: permissionsServerRef.current === serverId ? serverPermissions : prev?.permissions ?? null,
      channelEffects: Object.keys(effects).length > 0 ? effects : prev?.channelEffects ?? {},
      timeouts: serverTimeouts.filter((t) => t.server_id === serverId),
      bans: serverBans.filter((b) => b.server_id === serverId),
    }, SPACE_CACHE_LIMIT);
  }, [activeServerId, viewMode, categories, channels, members, membersHasMore, serverRoles, serverPermissions, channelEffects, serverTimeouts, serverBans]);

  // Record the channel on screen: its newest rows and their reactions.
  useEffect(() => {
    const channelId = activeChannelId;
    if (!channelId || viewMode !== "space" || messagesLoading) return;
    if (messages.length === 0 || messages.some((m) => m.channel_id !== channelId)) return;
    const settled = messages.filter((m) => !m.id.startsWith("opt-"));
    const rows = settled.slice(-CHANNEL_SNAPSHOT_ROWS);
    const ids = new Set(rows.map((m) => m.id));
    rememberRecent(channelSnapshotsRef.current, channelId, {
      messages: rows,
      hasMore: channelHasMore || rows.length < settled.length,
      reactions: messageReactions.filter((r) => r.context_type === "channel" && ids.has(r.message_id)),
    }, CHANNEL_CACHE_LIMIT);
  }, [activeChannelId, viewMode, messagesLoading, messages, channelHasMore, messageReactions]);

  /** Paint a channel from its snapshot. False when there is none. */
  const restoreChannelSnapshot = useCallback((channelId: string) => {
    const snap = channelSnapshotsRef.current.get(channelId);
    if (!snap) return false;
    setMessages(snap.messages);
    setChannelHasMore(snap.hasMore);
    setMessageReactions((prev) => replaceReactionsForContext(prev, "channel", snap.reactions));
    setMessagesLoading(false);
    return true;
  }, []);

  /**
   * Paint a space from its snapshot, or clear the last space's roster and
   * roles so they never show under this one. True when a snapshot was used.
   */
  const restoreSpaceSnapshot = useCallback((serverId: string) => {
    const snap = spaceSnapshotsRef.current.get(serverId);
    if (!snap) {
      fullMembersRef.current = [];
      setMembers([]);
      setServerRoles([]);
      setChannelEffects({});
      setServerTimeouts([]);
      setServerBans([]);
      return false;
    }
    setCategories(snap.categories);
    setChannels(snap.channels);
    setMembers(snap.members);
    fullMembersRef.current = snap.members;
    membersHasMoreRef.current = snap.membersHasMore;
    memberPageRef.current = Math.max(1, Math.ceil(snap.members.length / MEMBER_PAGE_SIZE));
    setMembersHasMore(snap.membersHasMore);
    setMembersLoading(snap.members.length === 0);
    setServerRoles(snap.roles);
    if (snap.permissions) {
      permissionsServerRef.current = serverId;
      setServerPermissions(snap.permissions);
    }
    setChannelEffects(snap.channelEffects);
    setServerTimeouts(snap.timeouts);
    setServerBans(snap.bans);
    serverDetailsCacheRef.current = { categories: snap.categories, channels: snap.channels, roles: snap.roles };
    return true;
  }, []);

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
    if (viewModeRef.current === "space" && activeServerRef.current === serverId && activeChannelRef.current) return;
    persistActiveServerChannel();
    viewModeRef.current = "space";
    activeServerRef.current = serverId;
    activeChannelRef.current = null;
    activeDmRef.current = null;
    activeGroupRef.current = null;
    setViewMode("space");
    setActiveServerId(serverId);
    setActiveDmThreadId(null);
    setActiveGroupChatId(null);
    clearServerIndicator(serverId);
    // A space you've been in comes back as you left it: its channel rail,
    // roster and last channel's messages paint now, and refresh behind.
    let painted = false;
    if (restoreSpaceSnapshot(serverId)) {
      const snap = spaceSnapshotsRef.current.get(serverId)!;
      const savedId = getLastChannelId(serverId);
      const target = snap.channels.find((c) => c.id === savedId)
        ?? snap.channels.find((c) => c.type === "text") ?? snap.channels[0];
      if (target) {
        activeChannelRef.current = target.id;
        setActiveChannelId(target.id);
        painted = restoreChannelSnapshot(target.id);
      }
    }
    if (!painted) {
      if (!activeChannelRef.current) setActiveChannelId(null);
      setMessages([]);
      setMessagesLoading(true);
      setChannelHasMore(false);
    }
    const channelRows = await loadServerDetails(serverId).catch(() => []);
    // A slow response from a previous navigation must not select a channel.
    if (activeServerRef.current !== serverId || viewModeRef.current !== "space") return;
    const savedId = getLastChannelId(serverId);
    const target = channelRows.find(c => c.id === activeChannelRef.current)
      ?? channelRows.find(c => c.id === savedId)
      ?? channelRows.find(c => c.type === "text") ?? channelRows[0];
    if (target) {
      // The fallback selector may already have loaded this channel while the
      // server details request was pending. Never clear that loaded result.
      if (activeChannelRef.current !== target.id) {
        activeChannelRef.current = target.id;
        setActiveChannelId(target.id);
        setMessages([]);
        setMessagesLoading(true);
      }
      await loadMessages(target.id);
    } else {
      setMessagesLoading(false);
    }
  }, [loadServerDetails, loadMessages, clearServerIndicator, persistActiveServerChannel, markActivity, restoreSpaceSnapshot, restoreChannelSnapshot]);

  const selectChannel = useCallback((channelId: string) => {
    markActivity();
    if (activeChannelRef.current === channelId && viewModeRef.current === "space") return;
    viewModeRef.current = "space";
    activeChannelRef.current = channelId;
    setActiveChannelId(channelId);
    setActiveDmThreadId(null);
    setActiveGroupChatId(null);

    if (!restoreChannelSnapshot(channelId)) {
      setMessages([]);
      setMessagesLoading(true);
      setChannelHasMore(false);
    }
    if (viewMode !== "space") setViewMode("space");
    const channel = channels.find((c) => c.id === channelId) ?? channelsRef.current.find((c) => c.id === channelId);
    if (channel) {
      clearServerIndicator(channel.server_id);
      setLastChannelId(channel.server_id, channelId);
      // Optimistically clear this channel's mention contribution so the
      // server badge doesn't linger until the async refresh lands.
      const channelMentions = channelMentionMap.get(channelId) ?? 0;
      if (channelMentions > 0) {
        setServerMentionCounts((prev) => {
          const next = new Map(prev);
          const current = next.get(channel.server_id) ?? 0;
          const updated = current - channelMentions;
          if (updated <= 0) next.delete(channel.server_id);
          else next.set(channel.server_id, updated);
          return next;
        });
      }
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
    // Opening the channel is the acknowledgement. Persist it so a restart does
    // not repaint the mention we just read.
    void markChannelMentionsRead(channelId);
  }, [viewMode, channels, clearServerIndicator, markActivity, markChannelMentionsRead, restoreChannelSnapshot]);

  const selectDmThread = useCallback(async (threadId: string) => {
    markActivity();
    persistActiveServerChannel();
    // Opening a DM always brings its row back, even if it was closed.
    const thread = dmThreadsRef.current.find((t) => t.id === threadId);
    if (thread) unhideDmFriend(thread.friend.id);
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
  }, [loadDmMessages, clearDmUnread, markDmReadNow, persistActiveServerChannel, markActivity, unhideDmFriend]);

  const selectGroupChat = useCallback(async (groupId: string) => {
    markActivity();
    persistActiveServerChannel();
    viewModeRef.current = "group";
    activeChannelRef.current = null;
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
    await Promise.all([markGroupReadNow(groupId), loadGroupMessages(groupId)]);
  }, [loadGroupMessages, clearGroupUnread, markGroupReadNow, persistActiveServerChannel, markActivity]);

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
  }, [userId, loadGroupChats, selectGroupChat, hasRestriction]);

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

  const openDmWithFriend = useCallback(async (friendId: string): Promise<string | null> => {
    if (!userId) return "Not signed in";
    // Tether is not a friend and never can be (bots can't accept requests),
    // so it gets its own gate: Aero subscribers may DM Tether directly, which
    // get_or_create_dm_thread permits for flagged bots (migration 0102).
    if (friendId === tetherProfile?.id && subscriptionPlan !== "aero") return "Messaging Tether needs Aero.";
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
      return error.message;
    }
    const threadId = data as string;

    if (token !== dmOpenTokenRef.current) return "Superseded";

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
    return null;
  }, [userId, friends, selectDmThread, loadDmThreads, tetherProfile, subscriptionPlan]);

  const respondMessageRequest = useCallback(async (threadId: string, action: "accept" | "ignore") => {
    const { error } = await getSupabaseClient().rpc("respond_message_request", { p_thread_id: threadId, p_action: action });
    if (error) return error.message;
    const now = new Date().toISOString();
    setDmThreads((prev) => prev.map((t) => (t.id === threadId
      ? action === "accept"
        ? { ...t, accepted_at: now, request_ignored_at: null }
        : { ...t, request_ignored_at: now }
      : t)));
    if (action === "ignore") clearDmUnread(threadId);
    return null;
  }, [clearDmUnread]);

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

    // Answer from the friend list already in memory when we can: no
    // round trip to Oregon just to say "already friends".
    const known = friendships.find((f) => {
      const other = f.requester_id === userId ? f.addressee : f.requester;
      return other?.username?.toLowerCase() === normalized;
    });
    if (known) {
      if (known.status === "accepted") return "You are already friends";
      if (known.status === "pending") {
        return known.requester_id === userId
          ? "Friend request already sent"
          : "This user already sent you a friend request — check Pending to accept or decline";
      }
    }

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

    // No separate "does a row exist?" query: friendships_pair_unique makes
    // the insert itself fail with 23505 for any existing pair, either way
    // round, and the conflict branch below explains which case it is.
    const { data: created, error } = await supabase
      .from("friendships")
      .insert({ requester_id: userId, addressee_id: target.id })
      .select("*, requester:profiles!requester_id(*), addressee:profiles!addressee_id(*)")
      .single();
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
    // Show it straight away from the insert's own result instead of
    // re-reading every friendship; the realtime feed reconciles later.
    if (created) {
      const row = created as unknown as DbFriendship & { requester: Profile | null; addressee: Profile | null };
      setFriendships((prev) => [
        ...prev.filter((f) => f.id !== row.id),
        { ...row, requester: row.requester ?? undefined, addressee: row.addressee ?? undefined },
      ]);
    } else {
      void loadFriendships(userId);
    }
    return null;
  }, [userId, friendships, loadFriendships, hasRestriction]);

  const respondFriendRequest = useCallback(async (id: string, accept: boolean) => {
    if (!userId) return;
    const supabase = getSupabaseClient();
    const pending = friendships.find((f) => f.id === id);
    // Update the list first and write behind it, so Accept and Ignore feel
    // instant even from the other side of the world. A failed write puts
    // the real state back.
    setFriendships((prev) => accept
      ? prev.map((f) => (f.id === id ? { ...f, status: "accepted" } : f))
      : prev.filter((f) => f.id !== id));
    if (accept && pending) {
      const friendId = pending.requester_id === userId ? pending.addressee_id : pending.requester_id;
      bumpFriendActivity(friendId);
    }
    const { error } = accept
      ? await supabase.from("friendships").update({ status: "accepted" }).eq("id", id)
      : await supabase.from("friendships").delete().eq("id", id);
    if (error) void loadFriendships(userId);
  }, [userId, friendships, loadFriendships, bumpFriendActivity]);

  const removeFriend = useCallback(async (friendId: string) => {
    if (!userId) return;
    const supabase = getSupabaseClient();
    setFriendships((prev) => prev.filter((f) =>
      !(f.status !== "blocked" &&
        ((f.requester_id === userId && f.addressee_id === friendId) ||
         (f.requester_id === friendId && f.addressee_id === userId)))));
    const { error } = await supabase
      .from("friendships")
      .delete()
      .or(`and(requester_id.eq.${userId},addressee_id.eq.${friendId}),and(requester_id.eq.${friendId},addressee_id.eq.${userId})`);
    if (error) void loadFriendships(userId);
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
  }, [userId, user?.email, ensureProfile, loadServers, selectServer, hasRestriction]);

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
  }, [userId, user?.email, ensureProfile, loadServers, selectServer, hasRestriction]);

  const joinServerById = useCallback(async (serverId: string) => {
    if (!userId) return "Not signed in";
    if (hasRestriction("join_servers")) return "Your account is restricted from joining spaces.";
    await ensureProfile(userId, user?.email);
    const { error } = await getSupabaseClient().rpc("join_server_by_id", { p_server_id: serverId });
    if (error) return error.message;
    await loadServers(userId);
    await selectServer(serverId);
    return null;
  }, [userId, user?.email, ensureProfile, loadServers, selectServer, hasRestriction]);

  // Kick and ban happen in another window, but the rail must move now, not on
  // the next manual refresh. The database mirrors membership changes and new
  // DMs (including moderation notices) onto this private per-user topic; CDC
  // and full reloads remain the durable fallbacks.
  useEffect(() => {
    if (!userId || !configured) return;
    const supabase = getSupabaseClient();
    let disposed = false;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let sub: RealtimeChannel;

    const connect = () => {
      if (disposed) return;
      const channel = supabase.channel(`user-events:${userId}`, {
        config: { private: true },
      });
      sub = channel;
      channel
        .on("broadcast", { event: "MEMBERSHIP_REMOVE" }, ({ payload }) => {
          const record = payload as { server_id?: string } | null;
          const serverId = typeof record?.server_id === "string" ? record.server_id : null;
          if (!serverId) return;

          const next = serversRef.current.filter((server) => server.id !== serverId);
          serversRef.current = next;
          setServers(next);
          setCache(`servers:${userId}`, next);
          if (activeServerRef.current === serverId) {
            setViewHome();
          }
          void loadServers(userId);
        })
        .on("broadcast", { event: "MEMBERSHIP_ADD" }, () => {
          void loadServers(userId);
        })
        .on("broadcast", { event: "DM" }, ({ payload }) => {
          const data = payload as { record?: Record<string, unknown> } | null;
          const record = data?.record;
          const threadId = typeof record?.thread_id === "string" ? record.thread_id : null;
          if (!threadId) return;
          bumpDmThreadActivity(
            threadId,
            typeof record?.created_at === "string" ? record.created_at : undefined,
          );
          if (!dmThreadsRef.current.some((thread) => thread.id === threadId)) {
            void loadDmThreads(userId);
          }
        });

      channel.subscribe((status) => {
        if (disposed || sub !== channel) return;
        if (status === "SUBSCRIBED") {
          attempt = 0;
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          void supabase.removeChannel(channel);
          retry = setTimeout(connect, Math.min(30_000, 1000 * 2 ** attempt++));
        }
      });
    };

    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      if (sub) void supabase.removeChannel(sub);
    };
  }, [configured, userId, loadServers, loadDmThreads, bumpDmThreadActivity, setViewHome]);

  const kickMember = useCallback(async (targetUserId: string) => {
    if (!activeServerId) return "No space selected";
    await ensureFreshSession();
    const { error } = await getSupabaseClient().rpc("kick_server_member", {
      p_server_id: activeServerId,
      p_user_id: targetUserId,
    });
    if (error) return error.message;
    await loadServerDetails(activeServerId, { refreshMembers: true });
    return null;
  }, [activeServerId, loadServerDetails]);

  const banMember = useCallback(async (targetUserId: string, reason?: string) => {
    if (!activeServerId) return "No space selected";
    await ensureFreshSession();
    const { error } = await getSupabaseClient().rpc("ban_server_member", {
      p_server_id: activeServerId,
      p_user_id: targetUserId,
      p_reason: reason ?? null,
    });
    if (error) return error.message;
    await loadServerDetails(activeServerId, { refreshMembers: true });
    return null;
  }, [activeServerId, loadServerDetails]);

  const unbanMember = useCallback(async (targetUserId: string) => {
    if (!activeServerId) return "No space selected";
    await ensureFreshSession();
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
    await ensureFreshSession();
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
    await ensureFreshSession();
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
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) return "Invalid colour";
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
    await ensureFreshSession();
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
    await ensureFreshSession();
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

  // Desktop (and any session that has sat idle) can end up with an expired
  // access token; permission-gated RPCs then run as anon (auth.uid() is null)
  // and fail with "Insufficient permissions". Refresh before mutating.
  const ensureFreshSession = useCallback(async () => {
    const supabase = getSupabaseClient();
    const { data } = await supabase.auth.getSession();
    if (data.session && isAccessTokenExpired(data.session)) {
      await refreshSessionOnce();
    }
  }, []);

  const createRole = useCallback(async (data: { name: string; color: string; icon?: string | null; permissions?: ServerRole["permissions"] }) => {
    if (!activeServerId) return "No space selected";
    await ensureFreshSession();
    const { error } = await getSupabaseClient().from("server_roles").insert({
      server_id: activeServerId,
      name: data.name.trim(),
      color: data.color,
      icon: (data.icon ?? "").trim() || null,
      position: serverRoles.length,
      ...(data.permissions ? { permissions: data.permissions } : {}),
    });
    if (error) return error.message;
    await loadServerDetails(activeServerId);
    return null;
  }, [activeServerId, serverRoles.length, loadServerDetails]);

  const updateRole = useCallback(async (
    roleId: string,
    patch: Partial<Pick<ServerRole, "name" | "color" | "icon" | "permissions" | "gradient_to" | "gradient_animated" | "self_assignable">>,
  ) => {
    if (!activeServerId) return "No space selected";
    await ensureFreshSession();
    const update: Record<string, unknown> = {};
    if (patch.name !== undefined) update.name = patch.name.trim();
    if (patch.color !== undefined) update.color = patch.color;
    if (patch.icon !== undefined) update.icon = (patch.icon ?? "").trim() || null;
    if (patch.gradient_to !== undefined) update.gradient_to = patch.gradient_to;
    if (patch.gradient_animated !== undefined) update.gradient_animated = patch.gradient_animated;
    if (patch.permissions !== undefined) update.permissions = patch.permissions;
    if (patch.self_assignable !== undefined) update.self_assignable = patch.self_assignable;
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
    await ensureFreshSession();
    const { error } = await getSupabaseClient().rpc("set_member_roles", {
      p_server_id: activeServerId,
      p_user_id: targetUserId,
      p_role_ids: roleIds,
    });
    if (error) return error.message;

    // Patch the member in place instead of refreshing the roster. A refresh
    // resets the member list to page one, which drops anyone the user loaded
    // from a later page — and with them, every mention chip for that person
    // in the channel (the chat renderer validates mentions against `members`).
    const nextRoleIds = roleIds.filter((id) => assignableRoleIdsRef.current.has(id));
    // Keep the legacy single-role column in sync too: profile surfaces fall
    // back to it when `role_ids` is empty.
    const highestRoleId = nextRoleIds
      .map((id) => serverRoles.find((role) => role.id === id))
      .filter((role): role is ServerRole => !!role)
      .sort((a, b) => b.position - a.position)[0]?.id ?? null;
    memberRoleIdsRef.current.set(targetUserId, nextRoleIds);
    const patch = (member: ServerMember & { profile: Profile }) =>
      member.user_id === targetUserId
        ? { ...member, role_ids: nextRoleIds, role_id: highestRoleId }
        : member;
    fullMembersRef.current = fullMembersRef.current.map(patch);
    setMembers((current) => current.map(patch));
    writeMembersCache(activeServerId);
    return null;
  }, [activeServerId, serverRoles, writeMembersCache]);

  const setSelfRoles = useCallback(async (roleIds: string[]) => {
    if (!activeServerId) return "No space selected";
    await ensureFreshSession();
    if (!userId) return "Sign in first";
    const { error } = await getSupabaseClient().rpc("set_self_member_roles", {
      p_server_id: activeServerId,
      p_role_ids: roleIds,
    });
    if (error) return error.message;

    // The RPC only touches self-assignable roles. Keep every staff-granted
    // role in the local member row so the UI doesn't flicker one off.
    const selfIds = new Set(
      serverRoles.filter((role) => !role.is_default && role.self_assignable).map((role) => role.id),
    );
    const current = memberRoleIdsRef.current.get(userId) ?? [];
    const chosen = [...new Set(roleIds)].filter((id) => selfIds.has(id));
    const nextRoleIds = [...current.filter((id) => !selfIds.has(id)), ...chosen];
    const highestRoleId = nextRoleIds
      .map((id) => serverRoles.find((role) => role.id === id))
      .filter((role): role is ServerRole => !!role)
      .sort((a, b) => b.position - a.position)[0]?.id ?? null;
    memberRoleIdsRef.current.set(userId, nextRoleIds);
    const patch = (member: ServerMember & { profile: Profile }) =>
      member.user_id === userId
        ? { ...member, role_ids: nextRoleIds, role_id: highestRoleId }
        : member;
    fullMembersRef.current = fullMembersRef.current.map(patch);
    setMembers((current) => current.map(patch));
    writeMembersCache(activeServerId);
    return null;
  }, [activeServerId, userId, serverRoles, writeMembersCache]);

  const topRolePositionFor = useCallback((targetUserId: string) => {
    const member = members.find((entry) => entry.user_id === targetUserId);
    const roleIds = memberRoleIdsRef.current.get(targetUserId)
      ?? (member?.role_ids && member.role_ids.length > 0
        ? member.role_ids
        : member?.role_id
          ? [member.role_id]
          : []);
    let top = 0;
    for (const roleId of roleIds) {
      const role = serverRoles.find((entry) => entry.id === roleId);
      if (role) top = Math.max(top, role.position);
    }
    return top;
  }, [members, serverRoles]);

  const myTopRolePosition = useMemo(() => {
    if (!activeServerId || !userId) return 0;
    if (activeServer?.owner_id === userId) return Number.MAX_SAFE_INTEGER;
    return topRolePositionFor(userId);
  }, [activeServerId, activeServer?.owner_id, userId, topRolePositionFor]);

  const canModerateMember = useCallback((targetUserId: string) => {
    if (!activeServerId || !userId || targetUserId === userId) return false;
    if (activeServer?.owner_id === targetUserId) return false;
    if (activeServer?.owner_id === userId) return true;
    return myTopRolePosition > topRolePositionFor(targetUserId);
  }, [activeServerId, activeServer?.owner_id, userId, myTopRolePosition, topRolePositionFor]);

  const hasServerPermission = useCallback(
    (permission: ServerPermissionKey) => serverPermissions[permission],
    [serverPermissions],
  );

  const createChannel = useCallback(async (data: { name: string; type?: ChannelType; categoryId?: string | null }) => {
    if (!activeServerId) return "No space selected";
    await ensureFreshSession();
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
    await ensureFreshSession();
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
    await ensureFreshSession();
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
    await ensureFreshSession();
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
    await ensureFreshSession();
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
    await ensureFreshSession();
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
    await ensureFreshSession();
    const { error } = await getSupabaseClient().rpc("delete_category", {
      p_category_id: categoryId,
    });
    if (error) return error.message;
    await loadServerDetails(activeServerId);
    return null;
  }, [activeServerId, loadServerDetails]);

  const moveChannel = useCallback(async (channelId: string, categoryId: string | null, index: number) => {
    if (!activeServerId) return "No space selected";
    await ensureFreshSession();
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
    await ensureFreshSession();
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
    await ensureFreshSession();
    const { error } = await getSupabaseClient().rpc("delete_server_role", {
      p_role_id: roleId,
    });
    if (error) return error.message;
    await loadServerDetails(activeServerId);
    return null;
  }, [activeServerId, loadServerDetails]);

  const moveRole = useCallback(async (roleId: string, position: number) => {
    if (!activeServerId) return "No space selected";
    await ensureFreshSession();
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

  const getMemberIconRole = useCallback(
    (member: ServerMember) => memberIconRole(member, serverRoles),
    [serverRoles],
  );

  // Tether: when an Aero user's message mentions @tether, fire the ask after
  // the message is saved. Inside a DM with Tether itself every message is an
  // ask (force). Client-side gates are cosmetic cost savers only —
  // the route re-checks plan, mention, and ownership with the service role.
  const fireTetherAsk = useCallback((messageId: string, surface: TetherSurface, content: string, opts?: { force?: boolean }) => {
    if (!opts?.force && !mentionsTether(content)) return;
    if (subscriptionPlan !== "aero") return;
    void askTether(messageId, surface);
  }, [subscriptionPlan]);

  /**
   * Resolve every @username in a channel message against the whole space.
   *
   * The composer only holds a window of the roster, so parsing against
   * `members` used to drop mentions of anyone outside that window (which on a
   * 5,000-member space is most people). Known names resolve locally; the rest
   * go to a space-scoped RPC before the message is inserted, so the mention
   * array — and therefore the notification and push — is complete.
   */
  const resolveServerMentionIds = useCallback(async (content: string): Promise<string[]> => {
    const tokens = parseMentionTokens(content);
    if (!tokens.length) return [];

    const byUsername = new Map(
      members
        .map((m) => m.profile)
        .filter((p) => !!p.username)
        .map((p) => [p.username!.toLowerCase(), p.id] as const),
    );
    const ids = new Set<string>();
    const missing: string[] = [];
    for (const token of tokens) {
      const id = byUsername.get(token);
      if (id) ids.add(id);
      else missing.push(token);
    }

    if (missing.length > 0 && activeServerId) {
      const { data, error } = await getSupabaseClient().rpc("resolve_server_mentions", {
        p_server_id: activeServerId,
        p_usernames: missing,
      });
      if (!error) {
        for (const row of (data ?? []) as { user_id: string }[]) ids.add(row.user_id);
      }
    }

    return [...ids];
  }, [members, activeServerId]);

  /**
   * Resolve @&role tokens to the role's current members. The role list is
   * small and already loaded; the membership query is authoritative because
   * the composer only holds a page of a large space's roster. Returning null
   * means the lookup failed, so the caller can refuse to silently send a
   * message that would not ping the people the author asked for.
   */
  const resolveRoleMentionIds = useCallback(async (content: string): Promise<string[] | null> => {
    if (!activeServerId) return [];
    const slugs = parseRoleMentionTokens(content);
    if (!slugs.length) return [];
    const roleIds = [...new Set(
      slugs
        .map((slug) => serverRoles.find(
          (role) => !role.is_default && roleMentionSlug(role.name).toLowerCase() === slug,
        )?.id)
        .filter((id): id is string => !!id),
    )];
    if (!roleIds.length) return [];
    const { data, error } = await getSupabaseClient()
      .from("member_roles")
      .select("user_id")
      .eq("server_id", activeServerId)
      .in("role_id", roleIds);
    if (error) return null;
    return [...new Set(
      ((data ?? []) as { user_id: string }[])
        .map((row) => row.user_id)
        .filter((id) => id !== userId),
    )];
  }, [activeServerId, serverRoles, userId]);

  const sendChannelMessage = useCallback(async (content: string, options: MessageSendOptions = {}) => {
    if (!userId || !activeChannelId || !profile) return "No channel selected";
    if (hasRestriction("send_messages")) return "Your account is restricted from sending messages.";
    markActivity();
    const { attachment, replyToId, pendingFile, pendingFiles, maxUploadBytes } = options;
    const normalized = normalizeMessageContent(content);
    if (!normalized && !attachment && !pendingFile && !pendingFiles?.length) return "Empty message";
    const wordErr = messageCharLimitError(normalized, maxMessageCharsRef.current);
    if (wordErr) return wordErr;
    const [resolvedMentionIds, roleMemberIds] = await Promise.all([
      resolveServerMentionIds(normalized),
      resolveRoleMentionIds(normalized),
    ]);
    if (roleMemberIds === null) return "Could not resolve that role mention. Try again.";
    if (roleMemberIds.length > 0 && !serverPermissions.mention_everyone) {
      return "You do not have permission to mention roles.";
    }
    const mentionIds = [...new Set([...resolvedMentionIds, ...roleMemberIds])];
    if (mentionIds.length > 10) {
      return roleMemberIds.length > 0
        ? "That role has too many members to mention (max 10)."
        : "Too many mentions in one message (max 10).";
    }
    if (userId) {
      const pingErr = checkMentionSend(userId, mentionIds, normalized);
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
    } else if (attachment && attachment.type !== "poll" && attachment.type !== "activity") {
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
      mentions: mentionIds,
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
  }, [userId, activeChannelId, profile, resolveServerMentionIds, resolveRoleMentionIds, serverPermissions, markActivity, fireTetherAsk, hasRestriction]);

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
    // Replying to a request accepts it (the database does the same on insert),
    // so the conversation moves into the DM list straight away.
    if (thread && incomingRequestIds.has(thread.id)) {
      const acceptedAt = new Date().toISOString();
      setDmThreads((prev) => prev.map((t) => (t.id === thread.id ? { ...t, accepted_at: acceptedAt, request_ignored_at: null } : t)));
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
    } else if (attachment && attachment.type !== "poll" && attachment.type !== "activity") {
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
    // A DM with Tether itself is a direct conversation: every message asks.
    const isTetherThread = !!tetherProfile?.id && thread?.friend?.id === tetherProfile.id;
    fireTetherAsk(saved.id, "dm", normalized, isTetherThread ? { force: true } : undefined);
    return null;
  }, [userId, activeDmThreadId, profile, dmThreads, bumpDmThreadActivity, markActivity, fireTetherAsk, tetherProfile, hasRestriction, incomingRequestIds]);

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
    } else if (attachment && attachment.type !== "poll" && attachment.type !== "activity") {
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
    setGroupChats((prev) => prev.map((g) => (g.id === activeGroupChatId ? { ...g, last_message_at: optimistic.created_at } : g)));

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
  }, [userId, activeGroupChatId, profile, groupChats, markActivity, fireTetherAsk, hasRestriction]);

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
    } else if (attachment && attachment.type !== "poll" && attachment.type !== "activity") {
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
    // Optimistic add: the row appears instantly and is swapped for the saved
    // row (or removed on failure) once the server responds.
    const tempId = `opt-rxn-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setMessageReactions((prev) => [
      ...prev,
      {
        id: tempId,
        context_type: context,
        message_id: messageId,
        user_id: userId,
        emoji,
        created_at: new Date().toISOString(),
      },
    ]);
    const { data, error } = await supabase
      .from("message_reactions")
      .insert({ context_type: context, message_id: messageId, user_id: userId, emoji })
      .select("*")
      .single();
    if (!error && data) {
      // Swap the optimistic row for the saved one so counts stay exact.
      setMessageReactions((prev) => prev.map((r) => (r.id === tempId ? (data as MessageReaction) : r)));
    } else {
      // Nothing landed: pull the optimistic row back out.
      setMessageReactions((prev) => prev.filter((r) => r.id !== tempId));
    }
  }, [userId, messageReactions]);

  const markNotificationsRead = useCallback(async () => {
    if (!userId) return;
    await getSupabaseClient().from("notifications").update({ read: true }).eq("user_id", userId).eq("read", false);
    setChannelMentionMap(new Map());
    setServerMentionCounts(new Map());
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

  const getServerMentionCount = useCallback(
    (serverId: string) => serverMentionCounts.get(serverId) ?? 0,
    [serverMentionCounts],
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
    officialProfile,
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
    membersLoading,
    membersHasMore,
    loadMoreMembers,
    loadAllMembers,
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
    refreshProfile,
    savedSessions,
    switchAccount,
    removeSavedAccount,
    registerAnonymousAccount,
    adoptAnonymousSession,
    loginAnonymousAccount,
    exportAnonymousData,
    purgeAnonymousAccount,
    requestAccountDeletion,
    cancelAccountDeletion,
    addingAccount,
    beginAddAccount,
    cancelAddAccount,
    addAccountPrefill,
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
    rosterVersion,
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
    setSelfRoles,
    myTopRolePosition,
    canModerateMember,
    getMemberColor,
    getMemberIconRole,
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
    transferCatalyst,
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
    messageRequests,
    isIncomingRequest,
    isOutgoingRequest,
    respondMessageRequest,
    serverUnreadIds,
    getDmUnreadCount,
    clearDmUnread,
    closeDmThread,
    unhideDmFriend,
    channelUnreadMap,
    getChannelUnreadCount,
    getChannelMentionCount,
    serverMentionCounts,
    getServerMentionCount,
    groupUnreadMap,
    getGroupUnreadCount,
    clearGroupUnread,
    presenceMap,
    listeningMap,
    activityMap,
    setGameActivity,
    channelHasMore,
    dmHasMore,
    groupHasMore,
    notesHasMore,
    loadMoreChannelMessages,
    loadChannelContextWindow,
    loadDmContextWindow,
    loadGroupContextWindow,
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

/**
 * Nullable version for components that also render outside the provider —
 * e.g. GiftCard, which mounts both inside chat (/app, provider present)
 * and standalone at /gift/[code] (no provider). Returns null instead of
 * throwing so those pages can SSR.
 */
export function useOptionalApp() {
  return useContext(AppContext);
}

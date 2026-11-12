import type { Message, MessageData } from "./message.js";

export type BotScope =
  | "messages.read"
  | "messages.write"
  | "messages.delete"
  | "messages.react"
  | "members.read"
  | "members.kick"
  | "members.ban"
  | "members.timeout"
  | "channels.read"
  | "channels.manage"
  | "webhooks.manage"
  | "roles.manage"
  | "servers.read"
  | "audit.read";

export type MessageEventType = "messageCreate" | "messageUpdate" | "messageDelete";
export type ReactionEventType = "reactionAdd" | "reactionRemove";
export type ChannelEventType = "channelCreate" | "channelUpdate" | "channelDelete";
export type RoleEventType = "roleCreate" | "roleUpdate" | "roleDelete";
export type ServerEventType = "serverUpdate" | "serverJoin" | "serverLeave" | "scopesUpdate";
export type BotEventType =
  | MessageEventType
  | ReactionEventType
  | "memberJoin"
  | "memberLeave"
  | "memberUpdate"
  | ChannelEventType
  | RoleEventType
  | ServerEventType
  | "interactionCreate";

export interface ReactionEvent {
  message_id: string;
  channel_id: string;
  server_id: string;
  emoji: string;
  user_id: string;
  /** reactionAdd only. */
  user?: { id: string; username: string | null; display_name: string | null; avatar_url: string | null; is_bot: boolean };
}

export interface ChannelEvent {
  channel_id: string;
  server_id: string;
  channel: Record<string, unknown> & { id: string; name: string; type: string; parent_id: string | null };
}

export interface RoleEvent {
  server_id: string;
  role_id: string;
  role: Record<string, unknown> & { id: string; name: string; position: number };
}

export interface ServerEvent {
  server_id: string;
  /** serverUpdate and serverJoin. */
  server?: Record<string, unknown> & { id: string; name: string };
  /** serverJoin and scopesUpdate. */
  scopes?: BotScope[];
}

export interface ReactionSummary {
  emoji: string;
  count: number;
  me: boolean;
}

export interface PublicUser {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  banner_url?: string | null;
  accent_color?: string | null;
  bio?: string | null;
  pronouns?: string | null;
  is_bot: boolean;
  verified_bot?: boolean;
  created_at?: string;
}

export interface BotServer {
  id: string;
  name: string;
  icon_url: string | null;
  owner_id: string;
  scopes: BotScope[];
  joined_at: string;
}

export interface ForumPost {
  id: string;
  forum_id: string;
  server_id: string;
  title: string;
  author_id: string | null;
  tags: string[];
  pinned: boolean;
  message_count: number;
  last_message_at: string;
  created_at: string;
  /** In listForumPosts: the first 300 characters of the opening message. */
  opening?: string | null;
}

export interface ForumPostInput {
  title: string;
  content?: string;
  tags?: string[];
  embeds?: unknown[];
  components?: unknown[];
}

export interface ClientUser {
  id: string;
  userId: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  scopes: string[];
}

export interface GatewayEvent {
  type: BotEventType;
  payload: unknown;
}

export interface ClientOptions {
  token: string;
  baseUrl?: string;
  gatewayTimeout?: number;
  requestTimeout?: number;
  allowInsecureLocalhost?: boolean;
  /** Retry 429s after Retry-After (default true). */
  retryRateLimits?: boolean;
  /** How many times to retry a 429 before throwing (default 3). */
  maxRetries?: number;
}

export interface SendMessageOptions {
  replyToId?: string | null;
  embeds?: unknown[];
  components?: unknown[];
}

export interface MessageEditPatch {
  content?: string | null;
  embeds?: unknown[] | null;
  components?: unknown[] | null;
}

export interface CreateChannelOptions {
  type?: "text" | "voice";
  categoryId?: string | null;
  category_id?: string | null;
  topic?: string | null;
  slowModeSeconds?: number;
  slow_mode_seconds?: number;
  readOnly?: boolean;
  read_only?: boolean;
  userLimit?: number | null;
  user_limit?: number | null;
  permissions?: Array<Record<string, unknown>>;
}

export interface ChannelPermissionOverwrite {
  can_view?: boolean | null;
  can_post?: boolean | null;
  can_react?: boolean | null;
  can_attach?: boolean | null;
}

export interface RoleInput {
  name?: string;
  color?: string | null;
  permissions?: Record<string, boolean>;
  self_assignable?: boolean;
  position?: number;
}

export interface WebhookInput {
  channel_id?: string;
  name?: string;
  avatar_url?: string | null;
  reset_token?: boolean;
}

export type MessageHandler = (message: Message) => void | Promise<void>;
export type ReadyHandler = (user: ClientUser) => void | Promise<void>;
export type ErrorHandler = (error: Error) => void | Promise<void>;

export class Client {
  constructor(options: ClientOptions);
  token: string;
  baseUrl: string;
  gatewayTimeout: number;
  requestTimeout: number;
  retryRateLimits: boolean;
  maxRetries: number;
  user: ClientUser | null;
  readonly connected: boolean;

  on(event: "ready", handler: ReadyHandler): this;
  on(event: MessageEventType, handler: MessageHandler): this;
  on(event: ReactionEventType, handler: (event: ReactionEvent) => void | Promise<void>): this;
  on(event: ChannelEventType, handler: (event: ChannelEvent) => void | Promise<void>): this;
  on(event: RoleEventType, handler: (event: RoleEvent) => void | Promise<void>): this;
  on(event: ServerEventType, handler: (event: ServerEvent) => void | Promise<void>): this;
  on(event: "memberJoin" | "memberLeave" | "memberUpdate" | "interactionCreate", handler: (payload: any) => void | Promise<void>): this;
  on(event: "error", handler: ErrorHandler): this;
  on(event: "debug", handler: (message: string) => void | Promise<void>): this;
  on(event: string, handler: (...args: any[]) => any): this;
  once(event: string, handler: (...args: unknown[]) => unknown): this;
  off(event: string, handler: (...args: unknown[]) => unknown): this;

  connect(): Promise<this>;
  close(): void;

  sendMessage(channelId: string, content: string | null | undefined, options?: SendMessageOptions): Promise<Message>;
  editMessage(channelId: string, messageId: string, patch: string | MessageEditPatch): Promise<Message>;
  listMessages(
    channelId: string,
    options?: { limit?: number; before?: string; after?: string; around?: string },
  ): Promise<Message[]>;
  getMessage(channelId: string, messageId: string): Promise<Message>;
  deleteMessage(channelId: string, messageId: string): Promise<void>;
  bulkDeleteMessages(channelId: string, messageIds: string[]): Promise<number>;
  sendTyping(channelId: string): Promise<void>;

  addReaction(channelId: string, messageId: string, emoji: string): Promise<any>;
  removeReaction(channelId: string, messageId: string, emoji: string): Promise<any>;
  listReactions(channelId: string, messageId: string): Promise<ReactionSummary[]>;
  listReactionUsers(channelId: string, messageId: string, emoji: string, options?: { limit?: number }): Promise<PublicUser[]>;
  removeUserReaction(channelId: string, messageId: string, emoji: string, userId: string): Promise<boolean>;
  clearReactions(channelId: string, messageId: string, options?: { emoji?: string }): Promise<number>;

  listForumPosts(forumId: string, options?: { limit?: number }): Promise<ForumPost[]>;
  createForumPost(forumId: string, post: ForumPostInput): Promise<{ post: ForumPost; message: Message }>;
  listPins(channelId: string): Promise<any[]>;
  pinMessage(channelId: string, messageId: string): Promise<any>;
  unpinMessage(channelId: string, messageId: string): Promise<any>;

  getServer(serverId: string): Promise<any>;
  updateServer(serverId: string, patch: Record<string, unknown>): Promise<any>;
  getServerPermissions(serverId: string): Promise<any>;
  listAuditLog(serverId: string, options?: { limit?: number }): Promise<any[]>;

  listCategories(serverId: string): Promise<any[]>;
  createCategory(serverId: string, name: string): Promise<any>;
  updateCategory(categoryId: string, patch: { name?: string; position?: number }): Promise<any>;
  deleteCategory(categoryId: string): Promise<void>;

  listChannels(serverId: string): Promise<any[]>;
  getChannel(channelId: string): Promise<any>;
  createChannel(serverId: string, name: string, options?: CreateChannelOptions): Promise<string>;
  updateChannel(channelId: string, patch: Record<string, unknown>): Promise<any>;
  renameChannel(channelId: string, name: string): Promise<any>;
  deleteChannel(channelId: string): Promise<void>;
  listChannelPermissions(channelId: string): Promise<any[]>;
  setChannelPermission(channelId: string, roleId: string, overwrite?: ChannelPermissionOverwrite): Promise<any>;
  deleteChannelPermission(channelId: string, roleId: string): Promise<any>;

  listMembers(serverId: string, options?: { query?: string; role?: string; limit?: number }): Promise<any[]>;
  getMember(serverId: string, userId: string): Promise<any>;
  kickMember(serverId: string, userId: string): Promise<any>;
  timeoutMember(serverId: string, userId: string, timeoutMinutes: number, reason?: string): Promise<any>;
  addMemberRole(serverId: string, userId: string, roleId: string): Promise<any>;
  removeMemberRole(serverId: string, userId: string, roleId: string): Promise<any>;

  listBans(serverId: string): Promise<any[]>;
  banMember(serverId: string, userId: string, options?: { reason?: string }): Promise<any>;
  unbanMember(serverId: string, userId: string): Promise<any>;

  listRoles(serverId: string): Promise<any[]>;
  createRole(serverId: string, role: RoleInput): Promise<any>;
  getRole(serverId: string, roleId: string): Promise<any>;
  updateRole(serverId: string, roleId: string, patch: RoleInput): Promise<any>;
  deleteRole(serverId: string, roleId: string): Promise<any>;

  listWebhooks(serverId: string): Promise<any[]>;
  createWebhook(serverId: string, options: WebhookInput): Promise<any>;
  getWebhook(webhookId: string): Promise<any>;
  updateWebhook(webhookId: string, patch: WebhookInput): Promise<any>;
  deleteWebhook(webhookId: string): Promise<void>;

  listCommands(): Promise<any[]>;
  setCommands(commands: any[]): Promise<any[]>;
  upsertCommand(command: any): Promise<any>;
  deleteCommand(name: string): Promise<any>;
  respondToInteraction(interactionId: string, response: Record<string, unknown>): Promise<any>;

  leaveServer(serverId: string): Promise<any>;
  createInvite(serverId: string, scopes: BotScope[]): Promise<{ code: string; invite_url: string }>;

  fetchMe(): Promise<{ user: PublicUser & { status_text: string | null }; bot: { id: string; name: string; scopes: BotScope[] } }>;
  setStatus(text: string | null): Promise<string | null>;
  listServers(): Promise<BotServer[]>;
  getUser(userId: string): Promise<PublicUser>;
}

import { REST } from "./rest.js";
import { Message } from "./message.js";
import { AuthError } from "./errors.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pathSegment = (value) => encodeURIComponent(String(value));

const EVENT_NAMES = new Set([
  "ready",
  "messageCreate",
  "messageUpdate",
  "messageDelete",
  "memberJoin",
  "memberLeave",
  "memberUpdate",
  "interactionCreate",
  "error",
  "debug",
]);

function shapeEvent(event, client) {
  if (event.type === "messageCreate" || event.type === "messageUpdate" || event.type === "messageDelete") {
    return [new Message(event.payload.message ?? event.payload, client)];
  }
  return [event.payload];
}

/**
 * The Disband bot client.
 *
 * ```js
 * import { Client } from "@disband/bot";
 *
 * const client = new Client({ token: process.env.DISBAND_BOT_TOKEN });
 *
 * client.on("messageCreate", async (message) => {
 *   if (message.author?.is_bot) return;
 *   if (message.content !== "!ping") return;
 *   await message.reply("pong");
 * });
 *
 * await client.connect();
 * ```
 */
export class Client {
  constructor(options = {}) {
    if (!options.token) throw new Error("A bot token is required (new Client({ token }))");
    this.token = options.token;
    const baseUrl = new URL(options.baseUrl || "https://www.disband.dev");
    const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]).has(baseUrl.hostname);
    if (baseUrl.username || baseUrl.password || baseUrl.hash) {
      throw new Error("Bot API URLs cannot contain credentials or fragments");
    }
    if (baseUrl.protocol !== "https:" && !(baseUrl.protocol === "http:" && options.allowInsecureLocalhost === true && loopback)) {
      throw new Error("Bot API URLs must use HTTPS (or explicitly enabled loopback HTTP)");
    }
    this.baseUrl = baseUrl.href.replace(/\/+$/, "");
    this.gatewayTimeout = options.gatewayTimeout ?? 20;
    this.requestTimeout = options.requestTimeout ?? Math.max((this.gatewayTimeout + 10) * 1000, 30_000);
    this._rest = new REST(this);
    this._listeners = new Map();
    this._stopped = false;
    this._connected = false;
    this.user = null;
  }

  on(event, handler) {
    if (!EVENT_NAMES.has(event)) throw new Error(`Unknown event "${event}"`);
    const set = this._listeners.get(event) ?? new Set();
    set.add(handler);
    this._listeners.set(event, set);
    return this;
  }

  once(event, handler) {
    const wrapped = (...args) => {
      this.off(event, wrapped);
      return handler(...args);
    };
    return this.on(event, wrapped);
  }

  off(event, handler) {
    const set = this._listeners.get(event);
    if (set) set.delete(handler);
    return this;
  }

  _reportHandlerError(event, error) {
    if (event === "error" || !this._listeners.get("error")?.size) {
      console.error(`[disband-bot] error in "${event}" handler`, error);
      return;
    }
    this._emit("error", error instanceof Error ? error : new Error(String(error)));
  }

  _emit(event, ...args) {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const handler of set) {
      try {
        Promise.resolve(handler(...args)).catch((err) => {
          this._reportHandlerError(event, err);
        });
      } catch (err) {
        this._reportHandlerError(event, err);
      }
    }
  }

  /**
   * Resolves the bot identity, emits `ready`, and starts the event gateway
   * loop. Resolves once the bot is connected (not when it disconnects).
   */
  async connect() {
    this._stopped = false;
    const me = await this._rest.get("/api/bot/me");
    this.user = {
      id: me.bot.id,
      userId: me.bot.user_id,
      name: me.bot.name,
      username: me.bot.username,
      avatarUrl: me.bot.avatar_url,
      scopes: me.bot.scopes ?? [],
    };
    this._connected = true;
    this._emit("ready", this.user);
    void this._gatewayLoop();
    return this;
  }

  async _gatewayLoop() {
    while (!this._stopped) {
      try {
        const { events } = await this._rest.get(`/api/v1/gateway?timeout=${this.gatewayTimeout}`);
        for (const event of events ?? []) {
          if (this._stopped) break;
          const type = event.type;
          if (EVENT_NAMES.has(type)) {
            this._emit(type, ...shapeEvent(event, this));
          } else {
            this._emit("debug", `Unknown gateway event type: ${String(type)}`);
          }
        }
      } catch (err) {
        if (this._stopped) break;
        if (err instanceof AuthError) {
          this._emit("error", new Error("Invalid bot token — check your DISBAND_BOT_TOKEN."));
          break;
        }
        this._emit("error", err);
        await sleep(3000);
      }
    }
    this._connected = false;
  }

  get connected() {
    return this._connected;
  }

  /** Stops the gateway loop. */
  close() {
    this._stopped = true;
  }

  // ------------------------------------------------------------ REST helpers

  async sendMessage(channelId, content, options = {}) {
    const body = {};
    if (content !== undefined && content !== null) body.content = content;
    if (options.replyToId !== undefined) body.reply_to_id = options.replyToId;
    if (options.embeds !== undefined) body.embeds = options.embeds;
    if (options.components !== undefined) body.components = options.components;
    const { message } = await this._rest.post(`/api/v1/channels/${pathSegment(channelId)}/messages`, body);
    return new Message(message, this);
  }

  async editMessage(channelId, messageId, patch = {}) {
    const body = {};
    if (typeof patch === "string") body.content = patch;
    else {
      if (patch.content !== undefined) body.content = patch.content;
      if (patch.embeds !== undefined) body.embeds = patch.embeds;
      if (patch.components !== undefined) body.components = patch.components;
    }
    const { message } = await this._rest.patch(
      `/api/v1/channels/${pathSegment(channelId)}/messages/${pathSegment(messageId)}`,
      body,
    );
    return new Message(message, this);
  }

  async listMessages(channelId, options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.set("limit", String(options.limit));
    if (options.before) params.set("before", options.before);
    const qs = params.toString();
    const { messages } = await this._rest.get(
      `/api/v1/channels/${pathSegment(channelId)}/messages${qs ? `?${qs}` : ""}`,
    );
    return (messages ?? []).map((m) => new Message(m, this));
  }

  /**
   * Deletes a message (messages.delete). The bot's own messages always;
   * others' need the manage_messages role permission. `messageId` may be a
   * UUID or a numeric display_id.
   */
  async deleteMessage(channelId, messageId) {
    await this._rest.delete(`/api/v1/channels/${pathSegment(channelId)}/messages/${pathSegment(messageId)}`);
  }

  /** Bulk-deletes 1–100 message UUIDs in a channel. */
  async bulkDeleteMessages(channelId, messageIds) {
    const data = await this._rest.post(`/api/v1/channels/${pathSegment(channelId)}/messages/bulk-delete`, {
      message_ids: messageIds,
    });
    return data?.deleted ?? 0;
  }

  async addReaction(channelId, messageId, emoji) {
    return this._rest.put(
      `/api/v1/channels/${pathSegment(channelId)}/messages/${pathSegment(messageId)}/reactions/${encodeURIComponent(String(emoji))}`,
    );
  }

  async removeReaction(channelId, messageId, emoji) {
    return this._rest.delete(
      `/api/v1/channels/${pathSegment(channelId)}/messages/${pathSegment(messageId)}/reactions/${encodeURIComponent(String(emoji))}`,
    );
  }

  async listPins(channelId) {
    const { pins } = await this._rest.get(`/api/v1/channels/${pathSegment(channelId)}/pins`);
    return pins ?? [];
  }

  async pinMessage(channelId, messageId) {
    return this._rest.put(`/api/v1/channels/${pathSegment(channelId)}/pins/${pathSegment(messageId)}`);
  }

  async unpinMessage(channelId, messageId) {
    return this._rest.delete(`/api/v1/channels/${pathSegment(channelId)}/pins/${pathSegment(messageId)}`);
  }

  async getServer(serverId) {
    const { server } = await this._rest.get(`/api/v1/servers/${pathSegment(serverId)}`);
    return server;
  }

  async updateServer(serverId, patch) {
    const { server } = await this._rest.patch(`/api/v1/servers/${pathSegment(serverId)}`, patch);
    return server;
  }

  async getServerPermissions(serverId) {
    return this._rest.get(`/api/v1/servers/${pathSegment(serverId)}/permissions`);
  }

  async listAuditLog(serverId, options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.set("limit", String(options.limit));
    const qs = params.toString();
    const { audit } = await this._rest.get(`/api/v1/servers/${pathSegment(serverId)}/audit${qs ? `?${qs}` : ""}`);
    return audit ?? [];
  }

  async listCategories(serverId) {
    const { categories } = await this._rest.get(`/api/v1/servers/${pathSegment(serverId)}/categories`);
    return categories ?? [];
  }

  async createCategory(serverId, name) {
    const { category } = await this._rest.post(`/api/v1/servers/${pathSegment(serverId)}/categories`, { name });
    return category;
  }

  async updateCategory(categoryId, patch) {
    const { category } = await this._rest.patch(`/api/v1/categories/${pathSegment(categoryId)}`, patch);
    return category;
  }

  async deleteCategory(categoryId) {
    await this._rest.delete(`/api/v1/categories/${pathSegment(categoryId)}`);
  }

  async listChannels(serverId) {
    const { channels } = await this._rest.get(`/api/v1/servers/${pathSegment(serverId)}/channels`);
    return channels ?? [];
  }

  async getChannel(channelId) {
    const { channel } = await this._rest.get(`/api/v1/channels/${pathSegment(channelId)}`);
    return channel;
  }

  async createChannel(serverId, name, options = {}) {
    const body = {
      name,
      type: options.type ?? "text",
      category_id: options.categoryId ?? options.category_id ?? null,
    };
    if (options.topic !== undefined) body.topic = options.topic;
    if (options.slowModeSeconds !== undefined) body.slow_mode_seconds = options.slowModeSeconds;
    else if (options.slow_mode_seconds !== undefined) body.slow_mode_seconds = options.slow_mode_seconds;
    if (options.readOnly !== undefined) body.read_only = options.readOnly;
    else if (options.read_only !== undefined) body.read_only = options.read_only;
    if (options.userLimit !== undefined) body.user_limit = options.userLimit;
    else if (options.user_limit !== undefined) body.user_limit = options.user_limit;
    if (options.permissions !== undefined) body.permissions = options.permissions;
    const data = await this._rest.post(`/api/v1/servers/${pathSegment(serverId)}/channels`, body);
    return data?.channel_id;
  }

  async updateChannel(channelId, patch) {
    const { channel } = await this._rest.patch(`/api/v1/channels/${pathSegment(channelId)}`, patch);
    return channel;
  }

  async renameChannel(channelId, name) {
    return this.updateChannel(channelId, { name });
  }

  async deleteChannel(channelId) {
    await this._rest.delete(`/api/v1/channels/${pathSegment(channelId)}`);
  }

  async listChannelPermissions(channelId) {
    const { permissions } = await this._rest.get(`/api/v1/channels/${pathSegment(channelId)}/permissions`);
    return permissions ?? [];
  }

  async setChannelPermission(channelId, roleId, overwrite = {}) {
    return this._rest.put(
      `/api/v1/channels/${pathSegment(channelId)}/permissions/${pathSegment(roleId)}`,
      overwrite,
    );
  }

  async deleteChannelPermission(channelId, roleId) {
    return this._rest.delete(`/api/v1/channels/${pathSegment(channelId)}/permissions/${pathSegment(roleId)}`);
  }

  async listMembers(serverId) {
    const { members } = await this._rest.get(`/api/v1/servers/${pathSegment(serverId)}/members`);
    return members ?? [];
  }

  async getMember(serverId, userId) {
    const { member } = await this._rest.get(
      `/api/v1/servers/${pathSegment(serverId)}/members/${pathSegment(userId)}`,
    );
    return member;
  }

  async kickMember(serverId, userId) {
    return this._rest.delete(`/api/v1/servers/${pathSegment(serverId)}/members/${pathSegment(userId)}`);
  }

  async timeoutMember(serverId, userId, timeoutMinutes, reason) {
    const body = { timeout_minutes: timeoutMinutes };
    if (reason !== undefined) body.reason = reason;
    return this._rest.patch(`/api/v1/servers/${pathSegment(serverId)}/members/${pathSegment(userId)}`, body);
  }

  async addMemberRole(serverId, userId, roleId) {
    return this._rest.put(
      `/api/v1/servers/${pathSegment(serverId)}/members/${pathSegment(userId)}/roles/${pathSegment(roleId)}`,
    );
  }

  async removeMemberRole(serverId, userId, roleId) {
    return this._rest.delete(
      `/api/v1/servers/${pathSegment(serverId)}/members/${pathSegment(userId)}/roles/${pathSegment(roleId)}`,
    );
  }

  async listBans(serverId) {
    const { bans } = await this._rest.get(`/api/v1/servers/${pathSegment(serverId)}/bans`);
    return bans ?? [];
  }

  async banMember(serverId, userId, options = {}) {
    const body = {};
    if (options.reason !== undefined) body.reason = options.reason;
    return this._rest.put(`/api/v1/servers/${pathSegment(serverId)}/bans/${pathSegment(userId)}`, body);
  }

  async unbanMember(serverId, userId) {
    return this._rest.delete(`/api/v1/servers/${pathSegment(serverId)}/bans/${pathSegment(userId)}`);
  }

  async listRoles(serverId) {
    const { roles } = await this._rest.get(`/api/v1/servers/${pathSegment(serverId)}/roles`);
    return roles ?? [];
  }

  async createRole(serverId, role) {
    const { role: created } = await this._rest.post(`/api/v1/servers/${pathSegment(serverId)}/roles`, role);
    return created;
  }

  async getRole(serverId, roleId) {
    const { role } = await this._rest.get(
      `/api/v1/servers/${pathSegment(serverId)}/roles/${pathSegment(roleId)}`,
    );
    return role;
  }

  async updateRole(serverId, roleId, patch) {
    const { role } = await this._rest.patch(
      `/api/v1/servers/${pathSegment(serverId)}/roles/${pathSegment(roleId)}`,
      patch,
    );
    return role;
  }

  async deleteRole(serverId, roleId) {
    return this._rest.delete(`/api/v1/servers/${pathSegment(serverId)}/roles/${pathSegment(roleId)}`);
  }

  async listWebhooks(serverId) {
    const { webhooks } = await this._rest.get(`/api/v1/servers/${pathSegment(serverId)}/webhooks`);
    return webhooks ?? [];
  }

  async createWebhook(serverId, options) {
    const { webhook } = await this._rest.post(`/api/v1/servers/${pathSegment(serverId)}/webhooks`, options);
    return webhook;
  }

  async getWebhook(webhookId) {
    const { webhook } = await this._rest.get(`/api/v1/webhooks/${pathSegment(webhookId)}`);
    return webhook;
  }

  async updateWebhook(webhookId, patch) {
    const { webhook } = await this._rest.patch(`/api/v1/webhooks/${pathSegment(webhookId)}`, patch);
    return webhook;
  }

  async deleteWebhook(webhookId) {
    await this._rest.delete(`/api/v1/webhooks/${pathSegment(webhookId)}`);
  }

  async listCommands() {
    const { commands } = await this._rest.get("/api/v1/commands");
    return commands ?? [];
  }

  async setCommands(commands) {
    const data = await this._rest.put("/api/v1/commands", { commands });
    return data?.commands ?? [];
  }

  async upsertCommand(command) {
    const data = await this._rest.post("/api/v1/commands", command);
    return data?.command ?? data;
  }

  async deleteCommand(name) {
    return this._rest.delete(`/api/v1/commands?name=${encodeURIComponent(String(name))}`);
  }

  async respondToInteraction(interactionId, response) {
    return this._rest.post(`/api/v1/interactions/${pathSegment(interactionId)}/callback`, response);
  }

  async leaveServer(serverId) {
    return this._rest.post(`/api/v1/servers/${pathSegment(serverId)}/leave`);
  }

  /**
   * Generates an invite for the bot to join a server. Send the returned
   * `invite_url` to the server owner, who approves it.
   */
  async createInvite(serverId, scopes) {
    if (!this.user?.id) throw new Error("Client is not connected — call connect() first.");
    return this._rest.post(`/api/v1/bots/${pathSegment(this.user.id)}/invites`, {
      server_id: serverId,
      scopes,
    });
  }
}

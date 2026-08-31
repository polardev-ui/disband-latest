import { REST } from "./rest.js";
import { Message } from "./message.js";
import { AuthError } from "./errors.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const EVENT_NAMES = new Set(["ready", "messageCreate", "messageUpdate", "messageDelete", "error", "debug"]);

function shapeEvent(event) {
  if (event.type === "messageCreate" || event.type === "messageUpdate") {
    return [event.payload.message ?? event.payload];
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
    this.baseUrl = (options.baseUrl || "https://www.disband.dev").replace(/\/+$/, "");
    this.gatewayTimeout = options.gatewayTimeout ?? 20;
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
      handler(...args);
    };
    return this.on(event, wrapped);
  }

  off(event, handler) {
    const set = this._listeners.get(event);
    if (set) set.delete(handler);
    return this;
  }

  _emit(event, ...args) {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const handler of set) {
      try {
        void handler(...args);
      } catch (err) {
        console.error(`[disband-bot] error in "${event}" handler`, err);
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
        for (const event of events) {
          if (this._stopped) break;
          this._emit(event.type, ...shapeEvent(event));
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
    const { message } = await this._rest.post(`/api/v1/channels/${channelId}/messages`, {
      content,
      reply_to_id: options.replyToId ?? null,
    });
    return new Message(message, this);
  }

  async listMessages(channelId, options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.set("limit", String(options.limit));
    if (options.before) params.set("before", options.before);
    const qs = params.toString();
    const { messages } = await this._rest.get(
      `/api/v1/channels/${channelId}/messages${qs ? `?${qs}` : ""}`,
    );
    return (messages ?? []).map((m) => new Message(m, this));
  }

  async listChannels(serverId) {
    const { channels } = await this._rest.get(`/api/v1/servers/${serverId}/channels`);
    return channels ?? [];
  }

  async listMembers(serverId) {
    const { members } = await this._rest.get(`/api/v1/servers/${serverId}/members`);
    return members ?? [];
  }

  async createChannel(serverId, name, options = {}) {
    const { channel_id } = await this._rest.post(`/api/v1/servers/${serverId}/channels`, {
      name,
      type: options.type ?? "text",
      category_id: options.categoryId ?? null,
    });
    return channel_id;
  }

  async renameChannel(channelId, name) {
    return this._rest.patch(`/api/v1/channels/${channelId}`, { name });
  }

  async deleteChannel(channelId) {
    return this._rest.delete(`/api/v1/channels/${channelId}`);
  }

  async leaveServer(serverId) {
    return this._rest.post(`/api/v1/servers/${serverId}/leave`);
  }

  /**
   * Generates an invite for the bot to join a server. Send the returned
   * `invite_url` to the server owner, who approves it.
   */
  async createInvite(serverId, scopes) {
    if (!this.user?.id) throw new Error("Client is not connected — call connect() first.");
    return this._rest.post(`/api/v1/bots/${this.user.id}/invites`, {
      server_id: serverId,
      scopes,
    });
  }
}

/** A message as returned by the Disband API. */
export class Message {
  constructor(data = {}, client) {
    this.client = client;
    this.id = data.id ?? null;
    this.channelId = data.channel_id ?? null;
    this.serverId = data.server_id ?? null;
    this.author = data.author ?? null;
    this.content = data.content ?? "";
    this.replyToId = data.reply_to_id ?? null;
    this.mentions = data.mentions ?? [];
    this.embeds = data.embeds ?? [];
    this.components = data.components ?? [];
    this.interaction = data.interaction ?? null;
    this.webhookId = data.webhook_id ?? null;
    this.attachment = data.attachment_url
      ? { url: data.attachment_url, type: data.attachment_type ?? null }
      : null;
    this.createdAt = data.created_at ?? null;
    this.editedAt = data.edited_at ?? null;
    this.displayId = data.display_id ?? null;
    this.raw = data;
  }

  /** True when the message was sent by a bot account. */
  get authorIsBot() {
    return Boolean(this.author?.is_bot);
  }

  /** Edits this message. A bot can edit its own; editing others needs manage_messages. */
  async edit(patch = {}) {
    return this.client.editMessage(this.channelId, this.id, patch);
  }

  /** Deletes this message (messages.delete; Manage Messages for others' messages). */
  async delete() {
    return this.client.deleteMessage(this.channelId, this.id);
  }

  /** Replies to this message in the same channel. */
  async reply(content, options = {}) {
    return this.client.sendMessage(this.channelId, content, {
      ...options,
      replyToId: options.replyToId ?? this.id,
    });
  }

  /** Adds the bot's reaction to this message. */
  async react(emoji) {
    return this.client.addReaction(this.channelId, this.id, emoji);
  }

  /** Removes the bot's reaction from this message. */
  async unreact(emoji) {
    return this.client.removeReaction(this.channelId, this.id, emoji);
  }

  /** Pins this message (pin_messages permission). */
  async pin() {
    return this.client.pinMessage(this.channelId, this.id);
  }

  /** Unpins this message (pin_messages permission). */
  async unpin() {
    return this.client.unpinMessage(this.channelId, this.id);
  }
}

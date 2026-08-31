/** A message as returned by the Disband API. */
export class Message {
  constructor(data, client) {
    this.client = client;
    this.id = data.id;
    this.channelId = data.channel_id;
    this.serverId = data.server_id ?? null;
    this.author = data.author ?? null;
    this.content = data.content ?? "";
    this.replyToId = data.reply_to_id ?? null;
    this.mentions = data.mentions ?? [];
    this.attachment = data.attachment_url
      ? { url: data.attachment_url, type: data.attachment_type ?? null }
      : null;
    this.createdAt = data.created_at ?? null;
    this.editedAt = data.edited_at ?? null;
    this.displayId = data.display_id ?? null;
  }

  /** True when the message was sent by a bot account. */
  get authorIsBot() {
    return Boolean(this.author?.is_bot);
  }

  /** Replies to this message in the same channel. */
  async reply(content, options = {}) {
    return this.client.sendMessage(this.channelId, content, {
      ...options,
      replyToId: options.replyToId ?? this.id,
    });
  }
}

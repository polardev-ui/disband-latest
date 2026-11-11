import type { Client, SendMessageOptions, MessageEditPatch } from "./client.js";

export interface BotUser {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_bot?: boolean;
}

export interface MessageData {
  id?: string | null;
  channel_id?: string | null;
  server_id?: string | null;
  author?: BotUser | null;
  content?: string;
  reply_to_id?: string | null;
  mentions?: string[];
  embeds?: unknown[];
  components?: unknown[];
  interaction?: unknown;
  webhook_id?: string | null;
  attachment_url?: string | null;
  attachment_type?: string | null;
  created_at?: string | null;
  edited_at?: string | null;
  display_id?: number | null;
  [key: string]: unknown;
}

export interface MessageSendOptionsCompat extends SendMessageOptions {}

export class Message {
  constructor(data: MessageData, client: Client);
  id: string | null;
  channelId: string | null;
  serverId: string | null;
  author: BotUser | null;
  content: string;
  replyToId: string | null;
  mentions: string[];
  embeds: unknown[];
  components: unknown[];
  interaction: unknown;
  webhookId: string | null;
  attachment: { url: string; type: string | null } | null;
  createdAt: string | null;
  editedAt: string | null;
  displayId: number | null;
  raw: MessageData;
  readonly authorIsBot: boolean;
  edit(patch: string | MessageEditPatch): Promise<Message>;
  reply(content: string, options?: MessageSendOptionsCompat): Promise<Message>;
  delete(): Promise<void>;
  react(emoji: string): Promise<any>;
  unreact(emoji: string): Promise<any>;
  pin(): Promise<any>;
  unpin(): Promise<any>;
}

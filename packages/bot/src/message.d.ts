import type { Client } from "./client.js";

export interface BotUser {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_bot: true;
}

export interface MessageData {
  id: string;
  channel_id: string;
  server_id?: string | null;
  author?: BotUser;
  content?: string;
  reply_to_id?: string | null;
  mentions?: string[];
  attachment_url?: string | null;
  attachment_type?: string | null;
  created_at?: string | null;
  edited_at?: string | null;
  display_id?: number | null;
}

export class Message {
  constructor(data: MessageData, client: Client);
  id: string;
  channelId: string;
  serverId: string | null;
  author: BotUser | null;
  content: string;
  replyToId: string | null;
  mentions: string[];
  attachment: { url: string; type: string | null } | null;
  createdAt: string | null;
  editedAt: string | null;
  displayId: number | null;
  readonly authorIsBot: boolean;
  reply(content: string, options?: MessageSendOptions): Promise<Message>;
}

export interface MessageSendOptions {
  replyToId?: string | null;
}

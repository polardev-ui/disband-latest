import type { Message, MessageData } from "./message.js";

export type BotScope = "messages.read" | "messages.write" | "members.read" | "channels.manage";
export type BotEventType = "messageCreate" | "messageUpdate" | "messageDelete";

export interface ClientUser {
  id: string;
  userId: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  scopes: BotScope[];
}

export interface GatewayEvent {
  type: BotEventType;
  payload: MessageData;
}

export interface ClientOptions {
  token: string;
  baseUrl?: string;
  gatewayTimeout?: number;
}

export type MessageHandler = (message: Message) => void | Promise<void>;
export type ReadyHandler = (user: ClientUser) => void | Promise<void>;
export type ErrorHandler = (error: Error) => void | Promise<void>;

export class Client {
  constructor(options: ClientOptions);
  token: string;
  baseUrl: string;
  gatewayTimeout: number;
  user: ClientUser | null;
  readonly connected: boolean;

  on(event: "ready", handler: ReadyHandler): this;
  on(event: "messageCreate" | "messageUpdate" | "messageDelete", handler: MessageHandler): this;
  on(event: "error", handler: ErrorHandler): this;
  on(event: "debug", handler: (message: string) => void | Promise<void>): this;
  once(event: string, handler: (...args: unknown[]) => unknown): this;
  off(event: string, handler: (...args: unknown[]) => unknown): this;

  connect(): Promise<this>;
  close(): void;

  sendMessage(channelId: string, content: string, options?: { replyToId?: string | null }): Promise<Message>;
  listMessages(channelId: string, options?: { limit?: number; before?: string }): Promise<Message[]>;
  listChannels(serverId: string): Promise<Array<Record<string, unknown>>>;
  listMembers(serverId: string): Promise<Array<Record<string, unknown>>>;
  createChannel(serverId: string, name: string, options?: { type?: "text" | "voice"; categoryId?: string | null }): Promise<string>;
  renameChannel(channelId: string, name: string): Promise<unknown>;
  deleteChannel(channelId: string): Promise<unknown>;
  leaveServer(serverId: string): Promise<unknown>;
  createInvite(serverId: string, scopes: BotScope[]): Promise<{ code: string; invite_url: string }>;
}

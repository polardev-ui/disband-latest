export { Client } from "./src/client.js";
export { Message, type BotUser, type MessageData, type MessageSendOptionsCompat } from "./src/message.js";
export type {
  ClientOptions,
  ClientUser,
  BotScope,
  BotEventType,
  MessageEventType,
  GatewayEvent,
  MessageHandler,
  ReadyHandler,
  ErrorHandler,
  SendMessageOptions,
  MessageEditPatch,
  CreateChannelOptions,
  ChannelPermissionOverwrite,
  RoleInput,
  WebhookInput,
} from "./src/client.js";
export {
  DisbandError,
  HttpError,
  AuthError,
  PermissionError,
  RateLimitError,
} from "./src/errors.js";

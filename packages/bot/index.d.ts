export { Client } from "./src/client.js";
export { Message, type BotUser, type MessageData, type MessageSendOptions } from "./src/message.js";
export type { ClientOptions, ClientUser, BotEventType, GatewayEvent, MessageHandler, ReadyHandler } from "./src/client.js";
export type { BotScope } from "./src/client.js";
export {
  DisbandError,
  HttpError,
  AuthError,
  PermissionError,
  RateLimitError,
} from "./src/errors.js";

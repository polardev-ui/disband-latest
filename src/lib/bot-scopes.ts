import type { BotScope } from "./bot-auth";

export const BOT_SCOPE_LABELS: Record<BotScope, { label: string; description: string }> = {
  "messages.read": {
    label: "Read messages",
    description: "Receive message events and read messages and channels.",
  },
  "messages.write": {
    label: "Post messages",
    description: "Send and reply to messages.",
  },
  "members.read": {
    label: "Read members",
    description: "See the member list of servers the bot has joined.",
  },
  "channels.manage": {
    label: "Manage channels",
    description: "Create, rename, and delete channels.",
  },
};

export const BOT_SCOPE_ORDER: BotScope[] = [
  "messages.read",
  "messages.write",
  "members.read",
  "channels.manage",
];

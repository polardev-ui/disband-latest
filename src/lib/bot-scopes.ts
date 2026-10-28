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
  "messages.delete": {
    label: "Delete messages",
    description: "Delete messages the bot can see.",
  },
  "messages.react": {
    label: "Add reactions",
    description: "Add and remove reactions on messages.",
  },
  "members.read": {
    label: "Read members",
    description: "See the member list of spaces the bot has joined.",
  },
  "members.kick": {
    label: "Kick members",
    description: "Remove members from a space. Never the owner, moderators or other bots.",
  },
  "members.ban": {
    label: "Ban members",
    description: "Ban members from a space. Never the owner, moderators or other bots.",
  },
  "members.timeout": {
    label: "Time out members",
    description: "Stop a member chatting for up to 28 days.",
  },
  "channels.read": {
    label: "Read channels",
    description: "List channels and categories.",
  },
  "channels.manage": {
    label: "Manage channels",
    description: "Create, rename, and delete channels.",
  },
  "webhooks.manage": {
    label: "Manage webhooks",
    description: "Create, edit, and delete webhooks.",
  },
};

export const BOT_SCOPE_ORDER: BotScope[] = [
  "messages.read",
  "messages.write",
  "messages.delete",
  "messages.react",
  "members.read",
  "members.kick",
  "members.ban",
  "members.timeout",
  "channels.read",
  "channels.manage",
  "webhooks.manage",
];

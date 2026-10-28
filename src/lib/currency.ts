/**
 * The Disband currency. Earned by using Disband, spent on rewards.
 *
 * The name is a placeholder until the final one is chosen; change it here
 * and everything that shows the currency follows. Amounts mirror the
 * database triggers in migration 0177 (the database is what actually pays).
 */
export const CURRENCY = {
  name: "Glimmer",
  plural: "Glimmers",
  /** One character for compact amounts. */
  symbol: "✦",
} as const;

export function formatCurrency(amount: number): string {
  return `${amount.toLocaleString("en-GB")} ${amount === 1 ? CURRENCY.name : CURRENCY.plural}`;
}

export interface EarnRule {
  id: string;
  label: string;
  amount: number;
  /** How often it can pay out. */
  limit: string;
}

export const EARN_RULES: EarnRule[] = [
  { id: "chat", label: "Chat: every 18 messages", amount: 10, limit: "Up to 400 a day" },
  { id: "create_server", label: "Create a space", amount: 85, limit: "Twice a day" },
  { id: "join_server", label: "Join a space", amount: 15, limit: "Once per space, up to 5 a day" },
  { id: "join_official", label: "Join the Disband Official space", amount: 30, limit: "Once" },
  { id: "avatar", label: "Change your profile picture", amount: 10, limit: "Once a day" },
  { id: "banner", label: "Change your banner", amount: 10, limit: "Once a day" },
  { id: "ad", label: "Watch a video ad", amount: 240, limit: "35s pays 240, 60s pays 480, longer pays more" },
];

export interface Reward {
  id: "aero_week" | "decoration";
  label: string;
  description: string;
  cost: number;
}

export const REWARDS: Reward[] = [
  { id: "aero_week", label: "Aero for a week", description: "Every Aero perk for seven days. Stacks with any time you already have.", cost: 650 },
  { id: "decoration", label: "A free decoration", description: "Pick any avatar decoration from the shop and keep it.", cost: 500 },
];

/** Ledger reasons, as people should read them. */
export const LEDGER_LABELS: Record<string, string> = {
  chat: "Chatting",
  create_server: "Created a space",
  join_server: "Joined a space",
  join_official: "Joined the Disband Official space",
  avatar: "New profile picture",
  banner: "New banner",
  ad: "Watched an ad",
  redeem_aero_week: "Redeemed Aero for a week",
  redeem_decoration: "Redeemed a decoration",
};

/** Same curve as the database's ad_reward_for. */
export function adReward(seconds: number): number {
  return Math.max(0, Math.min(1600, Math.round(9.6 * Math.min(seconds, 180) - 96)));
}

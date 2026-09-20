
export type SubscriptionPlan = "free" | "aero";

export type LegacyPlanName = SubscriptionPlan | "basic" | "super";

export function normalizePlan(plan: string | null | undefined): SubscriptionPlan {
  return plan === "aero" || plan === "basic" || plan === "super" ? "aero" : "free";
}

export interface Subscription {
  id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: SubscriptionPlan;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  canceled_at: string | null;
}

export const GRANTING_STATUSES = new Set(["active", "trialing", "past_due"]);

export function isGranting(status: string | null | undefined): boolean {
  return !!status && GRANTING_STATUSES.has(status);
}

export function planFromSubscription(sub: Subscription | null): SubscriptionPlan {
  if (!sub || !isGranting(sub.status)) return "free";
  return normalizePlan(sub.plan);
}

export interface PlanTier {
  id: SubscriptionPlan;
  name: string;
  monthlyPrice: number;
  badgeLabel: string | null;
  badgeClass: string;
  features: PlanFeature[];
  highlighted: boolean;
}

export interface PlanFeature {
  label: string;
  included: boolean;
  detail?: string;
}

const BASE_RATE = { burst: 7, minute: 40 };

export const ENTITLEMENTS: Record<SubscriptionPlan, {
  maxUploadBytes: number;
  maxMessageChars: number;
  maxBioLength: number;
  videoQuality: "720p" | "1080p" | "1440p";
  animatedAvatar: boolean;
  animatedBanner: boolean;
  customEmojiSlots: number;
  serverBoostsPerMonth: number;
  rateLimits: { burst: number; minute: number };
  usernameChangesPerDay: number;
  displayNameChangesPerDay: number;
  avatarChangesPerDay: number;
  profileChangeCooldowns: boolean;
  premiumThemeIds: string[];

  screenShare: boolean;
  historyExport: boolean;
  prioritySupport: boolean;
}> = {
  free: {
    maxUploadBytes: 50 * 1024 * 1024,
    maxMessageChars: 2000,
    maxBioLength: 190,
    videoQuality: "720p",
    animatedAvatar: false,
    animatedBanner: false,
    customEmojiSlots: 0,
    serverBoostsPerMonth: 0,
    rateLimits: BASE_RATE,
    usernameChangesPerDay: 2,
    displayNameChangesPerDay: 10,
    avatarChangesPerDay: 10,
    profileChangeCooldowns: true,
    premiumThemeIds: [],
    screenShare: true,
    historyExport: false,
    prioritySupport: false,
  },

  aero: {
    maxUploadBytes: 500 * 1024 * 1024,
    maxMessageChars: 4000,
    maxBioLength: 230,
    videoQuality: "1440p",
    animatedAvatar: true,
    animatedBanner: true,
    customEmojiSlots: Infinity,
    serverBoostsPerMonth: 2,
    rateLimits: { burst: 20, minute: 80 },
    usernameChangesPerDay: Infinity,
    displayNameChangesPerDay: Infinity,
    avatarChangesPerDay: Infinity,
    profileChangeCooldowns: false,
    premiumThemeIds: ["sunset-gold", "midnight-neon", "ocean", "aurora"],
    screenShare: true,
    historyExport: true,
    prioritySupport: true,
  },
};

export const PLANS: PlanTier[] = [
  {
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    badgeLabel: null,
    badgeClass: "",
    highlighted: false,
    features: [
      { label: "50 MB file uploads", included: true },
      { label: "HD video (720p)", included: true, detail: "30 fps" },
      { label: "Static avatar", included: true },
      { label: "Standard rate limits", included: true },
      { label: "4 themes", included: true },
    ],
  },
  {
    id: "aero",
    name: "Disband Aero",
    monthlyPrice: 899,
    badgeLabel: "Aero",
    badgeClass: "bg-[#fee75c]/20 text-[#fee75c]",
    highlighted: true,
    features: [
      { label: "500 MB file uploads", included: true, detail: "10× more than Free" },
      { label: "2K video (1440p)", included: true, detail: "120 fps" },
      { label: "Animated avatar + banner", included: true },
      { label: "Unlimited custom emoji", included: true },
      { label: "4 Catalysts every month", included: true, detail: "Boost any spaces you like" },
      { label: "Max rate limits", included: true, detail: "20 msg / 5s" },
      { label: "Unlimited profile changes", included: true },
      { label: "Custom profile theme", included: true, detail: "Gradient + accent" },
      { label: "9 custom skins", included: true, detail: "Plus your own CSS and icons" },
      { label: "4 exclusive themes", included: true },
      { label: "Screen sharing", included: true, detail: "4K at 120 fps" },
      { label: "Message history export", included: true },
      { label: "Priority support", included: true },
      { label: "Aero badge", included: true },
    ],
  },
];

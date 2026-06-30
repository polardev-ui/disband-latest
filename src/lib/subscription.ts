export type SubscriptionPlan = "free" | "basic" | "super";

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
  videoQuality: "480p" | "720p" | "1080p";
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
    videoQuality: "480p",
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
    screenShare: false,
    historyExport: false,
    prioritySupport: false,
  },
  basic: {
    maxUploadBytes: 150 * 1024 * 1024,
    maxMessageChars: 4000,
    maxBioLength: 230,
    videoQuality: "720p",
    animatedAvatar: true,
    animatedBanner: false,
    customEmojiSlots: 5,
    serverBoostsPerMonth: 0,
    rateLimits: { burst: 12, minute: 60 },
    usernameChangesPerDay: 8,
    displayNameChangesPerDay: 20,
    avatarChangesPerDay: 20,
    profileChangeCooldowns: false,
    premiumThemeIds: ["sunset-gold"],
    screenShare: false,
    historyExport: false,
    prioritySupport: false,
  },
  super: {
    maxUploadBytes: 500 * 1024 * 1024,
    maxMessageChars: 4000,
    maxBioLength: 230,
    videoQuality: "1080p",
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
      { label: "Standard video (480p)", included: true },
      { label: "Static avatar", included: true },
      { label: "Standard rate limits", included: true },
      { label: "4 themes", included: true },
    ],
  },
  {
    id: "basic",
    name: "Basic",
    monthlyPrice: 299,
    badgeLabel: "Basic",
    badgeClass: "bg-[#57f287]/20 text-[#57f287]",
    highlighted: false,
    features: [
      { label: "150 MB file uploads", included: true, detail: "3× more than Free" },
      { label: "HD video (720p)", included: true },
      { label: "Animated avatar", included: true },
      { label: "5 custom emoji slots", included: true },
      { label: "Faster rate limits", included: true, detail: "12 msg / 5s" },
      { label: "More profile changes", included: true, detail: "8× daily" },
      { label: "No profile cooldowns", included: true },
      { label: "Exclusive theme", included: true },
      { label: "Basic badge", included: true },
    ],
  },
  {
    id: "super",
    name: "Super",
    monthlyPrice: 899,
    badgeLabel: "Super",
    badgeClass: "bg-[#fee75c]/20 text-[#fee75c]",
    highlighted: true,
    features: [
      { label: "500 MB file uploads", included: true, detail: "10× more than Free" },
      { label: "Full HD video (1080p)", included: true, detail: "60 fps" },
      { label: "Animated avatar + banner", included: true },
      { label: "Unlimited custom emoji", included: true },
      { label: "2 server boosts / month", included: true },
      { label: "Max rate limits", included: true, detail: "20 msg / 5s" },
      { label: "Unlimited profile changes", included: true },
      { label: "Custom profile theme", included: true, detail: "Gradient + accent" },
      { label: "4 exclusive themes", included: true },
      { label: "Screen sharing", included: true },
      { label: "Message history export", included: true },
      { label: "Priority support", included: true },
      { label: "Super badge", included: true },
    ],
  },
];

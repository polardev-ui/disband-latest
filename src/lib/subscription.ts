
export type SubscriptionPlan = "free" | "lite" | "aero";

export type LegacyPlanName = SubscriptionPlan | "basic" | "super";

export function normalizePlan(plan: string | null | undefined): SubscriptionPlan {
  if (plan === "aero" || plan === "basic" || plan === "super") return "aero";
  if (plan === "lite") return "lite";
  return "free";
}

export type BillingInterval = "month" | "year";

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

/**
 * Gifted Aero (dashboard grants, giveaways). The subscriptions table knows
 * nothing about these — iOS's get_entitlement RPC resolves both sources,
 * and the web gate must too, or gifted users see the Aero badge while every
 * Aero feature tells them to subscribe.
 */
export interface GiftEntitlement {
  plan: string | null;
  expires_at: string | null;
}

/**
 * Best plan an active gift grants: Aero beats Lite beats free. A gift with
 * no expiry (dashboard grants) counts as active forever.
 */
export function activeGiftPlan(
  gifts: GiftEntitlement[] | null | undefined,
  now: number = Date.now(),
): SubscriptionPlan {
  let best: SubscriptionPlan = "free";
  for (const g of gifts ?? []) {
    if (g.expires_at && new Date(g.expires_at).getTime() <= now) continue;
    const plan = normalizePlan(g.plan);
    if (plan === "aero") return "aero";
    if (plan === "lite") best = "lite";
  }
  return best;
}

export function hasActiveGiftAero(
  gifts: GiftEntitlement[] | null | undefined,
  now: number = Date.now(),
): boolean {
  return activeGiftPlan(gifts, now) === "aero";
}

/**
 * Effective plan: the better of the Stripe subscription and any active
 * gifted time. This predates Lite and returned "free" for Lite subscribers
 * and Lite gift recipients alike — both now land on "lite".
 */
export function planWithGifts(
  sub: Subscription | null,
  gifts: GiftEntitlement[] | null | undefined,
  now: number = Date.now(),
): SubscriptionPlan {
  const subPlan = planFromSubscription(sub);
  const giftPlan = activeGiftPlan(gifts, now);
  if (subPlan === "aero" || giftPlan === "aero") return "aero";
  if (subPlan === "lite" || giftPlan === "lite") return "lite";
  return "free";
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

  lite: {
    maxUploadBytes: 100 * 1024 * 1024,
    maxMessageChars: 2500,
    maxBioLength: 200,
    videoQuality: "1080p",
    animatedAvatar: false,
    animatedBanner: false,
    customEmojiSlots: 10,
    serverBoostsPerMonth: 1,
    rateLimits: { burst: 10, minute: 50 },
    usernameChangesPerDay: 5,
    displayNameChangesPerDay: 20,
    avatarChangesPerDay: 20,
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
    highlighted: false,
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
  {
    id: "lite",
    name: "Disband Lite",
    monthlyPrice: 299,
    badgeLabel: "Lite",
    badgeClass: "bg-sky-400/20 text-sky-300",
    highlighted: true,
    features: [
      { label: "100 MB file uploads", included: true, detail: "2× more than Free" },
      { label: "Full HD video (1080p)", included: true },
      { label: "10 custom emoji slots", included: true },
      { label: "1 Catalyst every month", included: true, detail: "Boost a space you like" },
      { label: "Faster rate limits", included: true, detail: "10 msg / 5s" },
      { label: "More profile changes", included: true, detail: "5 name changes / day" },
      { label: "Screen sharing", included: true },
      { label: "Lite badge", included: true },
    ],
  },
];

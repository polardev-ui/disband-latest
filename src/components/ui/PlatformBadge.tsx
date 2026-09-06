"use client";

import { UserBadges } from "./UserBadges";
import { useEntitlement } from "@/lib/entitlement-store";
import type { SubscriptionPlan } from "@/lib/subscription";

interface PlatformBadgeProps {
  userId: string | null | undefined;
  /** Known plan, when the caller already has it — saves a lookup. */
  plan?: SubscriptionPlan;
  className?: string;
  size?: number;
  interactive?: boolean;
}

/**
 * Badges beside a name, wherever one appears.
 *
 * The subscription used to show here as a "SUPER" / "BASIC" text pill next to
 * the earned badges. It is the tier medallion now, so the row is all marks
 * rather than a word competing with icons, and the plan and its length read
 * from one object instead of two.
 */
export function PlatformBadge({
  userId, plan, className = "", size = 13, interactive = true,
}: PlatformBadgeProps) {
  const ent = useEntitlement(userId);
  const effective = plan && plan !== "free" ? plan : ent.plan;

  return (
    <UserBadges
      userId={userId}
      plan={effective}
      tenureMonths={ent.months}
      subscribedSince={ent.since}
      size={size}
      className={className}
      interactive={interactive}
    />
  );
}

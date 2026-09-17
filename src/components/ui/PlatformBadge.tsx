"use client";

import { UserBadges } from "./UserBadges";
import { useEntitlement } from "@/lib/entitlement-store";
import type { SubscriptionPlan } from "@/lib/subscription";

interface PlatformBadgeProps {
  userId: string | null | undefined;

  plan?: SubscriptionPlan;
  className?: string;
  size?: number;
  interactive?: boolean;
  variant?: "inline" | "full";
}

export function PlatformBadge({
  userId, plan, className = "", size = 13, interactive = true, variant = "inline",
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
      variant={variant}
    />
  );
}

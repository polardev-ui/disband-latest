import type { Profile } from "@/lib/supabase/types";
import { SubscriptionBadge } from "./SubscriptionBadge";
import { UserBadges } from "./UserBadges";

interface PlatformBadgeProps {
  profile: Pick<
    Profile,
    "show_owner_badge" | "show_staff_badge" | "show_og_badge" | "show_bounty_badge"
  > & { subscription_plan?: string };
  className?: string;
}

export function PlatformBadge({ profile, className = "" }: PlatformBadgeProps) {
  const hasPlatform = badgeCount(profile) > 0;
  return (
    <>
      <UserBadges profile={profile} className={className} />
      {!hasPlatform && profile.subscription_plan && profile.subscription_plan !== "free" ? (
        <SubscriptionBadge plan={profile.subscription_plan as "basic" | "super"} className={className} />
      ) : null}
    </>
  );
}

function badgeCount(
  profile: Pick<Profile, "show_owner_badge" | "show_staff_badge" | "show_og_badge" | "show_bounty_badge">,
): number {
  return (
    (profile.show_owner_badge ? 1 : 0) +
    (profile.show_staff_badge ? 1 : 0) +
    (profile.show_og_badge ? 1 : 0) +
    (profile.show_bounty_badge ? 1 : 0)
  );
}

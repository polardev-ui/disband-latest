import type { SubscriptionPlan } from "@/lib/subscription";
import { AeroIcon } from "@/components/icons/AeroIcon";

export function SubscriptionBadge({ plan, className = "", tooltip }: {
  plan: SubscriptionPlan; className?: string; tooltip?: boolean;
}) {
  if (plan === "free") return null;
  const label = plan === "lite" ? "Lite" : "Aero";
  return <span title={tooltip ? `${label} subscriber` : undefined} aria-label={`${label} subscriber`} className={`inline-flex shrink-0 text-super ${className}`}><AeroIcon size={16} lite={plan === "lite"} /></span>;
}

import type { SubscriptionPlan } from "@/lib/subscription";

interface SubscriptionBadgeProps {
  plan: SubscriptionPlan;
  className?: string;
  tooltip?: boolean;
}

const AERO = {
  label: "Aero",
  className: "bg-super/20 text-super",
};

export function SubscriptionBadge({ plan, className = "", tooltip }: SubscriptionBadgeProps) {
  if (plan === "free") return null;

  return (
    <span
      title={tooltip ? `${AERO.label} subscriber` : undefined}
      className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${AERO.className} ${className}`}
    >
      {AERO.label}
    </span>
  );
}

interface SubscriptionBadgeProps {
  plan: "free" | "basic" | "super";
  className?: string;
  tooltip?: boolean;
}

const STYLES: Record<string, { label: string; className: string }> = {
  basic: {
    label: "Basic",
    className: "bg-[#57f287]/20 text-[#57f287]",
  },
  super: {
    label: "Super",
    className: "bg-[#fee75c]/20 text-[#fee75c]",
  },
};

export function SubscriptionBadge({ plan, className = "", tooltip }: SubscriptionBadgeProps) {
  if (plan === "free") return null;

  const style = STYLES[plan];
  return (
    <span
      title={tooltip ? `${style.label} subscriber` : undefined}
      className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style.className} ${className}`}
    >
      {style.label}
    </span>
  );
}

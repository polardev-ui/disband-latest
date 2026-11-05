import type { SubscriptionPlan } from "@/lib/subscription";
import { AeroIcon } from "@/components/icons/AeroIcon";
import { useI18n } from "@/contexts/I18nContext";

export function SubscriptionBadge({ plan, className = "", tooltip }: {
  plan: SubscriptionPlan; className?: string; tooltip?: boolean;
}) {
  const { t } = useI18n();
  if (plan === "free") return null;
  const label = plan === "lite" ? "Lite" : "Aero";
  return <span title={tooltip ? t("{label} subscriber", { label }) : undefined} aria-label={t("{label} subscriber", { label })} className={`inline-flex shrink-0 text-super ${className}`}><AeroIcon size={16} lite={plan === "lite"} /></span>;
}

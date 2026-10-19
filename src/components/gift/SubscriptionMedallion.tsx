"use client";

export interface TierDef {
  key: string;
  label: string;
  months: number;
  base: string;
  deep: string;
  light: string;
}

export const TIERS: TierDef[] = [
  { key: "bronze", label: "Bronze", months: 1, base: "#c47a3d", deep: "#7d4620", light: "#e8a874" },
  { key: "silver", label: "Silver", months: 3, base: "#b9c0c8", deep: "#6f767e", light: "#e6ebf0" },
  { key: "gold", label: "Gold", months: 6, base: "#e8a33d", deep: "#8a5a12", light: "#ffd489" },
  { key: "platinum", label: "Platinum", months: 12, base: "#5ec8d8", deep: "#1f6b79", light: "#a9ecf6" },
  { key: "diamond", label: "Diamond", months: 24, base: "#a97bf0", deep: "#5b2f9c", light: "#d8bcff" },
  { key: "ruby", label: "Ruby", months: 60, base: "#d61f2f", deep: "#780c1a", light: "#ff8f8f" },
  { key: "opal", label: "Opal", months: 120, base: "#8bd4e8", deep: "#4a7f96", light: "#ffe6fb" },
];

export function tierForMonths(months: number): TierDef | null {
  let out: TierDef | null = null;
  for (const t of TIERS) if (months >= t.months) out = t;
  return out;
}

export function tierDuration(t: TierDef): string {
  if (t.months < 12) return `${t.months} month${t.months === 1 ? "" : "s"}`;
  const years = t.months / 12;
  return `${years} year${years === 1 ? "" : "s"}`;
}

export function nextTier(months: number): TierDef | null {
  return TIERS.find((t) => t.months > months) ?? null;
}

/** Aero's own folded wing. Tier colours carry tenure without a glossy coin. */
export function SubscriptionMedallion({
  tier, super: isSuper = false, size = 128, className = "",
}: { tier: TierDef; super?: boolean; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={`shrink-0 ${className}`} aria-hidden>
      <path fill={tier.base} d="M2 5 22 2l-7 20-4-9Z" />
      <path fill={tier.light} d="m2 5 20-3-11 11Z" />
      <path fill={tier.deep} d="m11 13 11-11-7 20Z" />
      <path fill={tier.light} d="m11 13 4 9-7-6Z" />
      {isSuper && <path fill={tier.base} d="m2 13 5 6-5 2Z" />}
    </svg>
  );
}

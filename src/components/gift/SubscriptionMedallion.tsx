"use client";

import { useId } from "react";

/**
 * The subscription badge: one medallion whose colour advances with how long
 * someone has been subscribed. Super adds four studs and a halo, so the plan
 * reads at a glance without any text beside it.
 */

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

export const TIER_DURATION: Record<number, string> = {
  1: "1 month", 3: "3 months", 6: "6 months", 12: "1 year",
  24: "2 years", 60: "5 years", 120: "10 years",
};

/** Highest tier reached at a given tenure. Below a month there is no badge. */
export function tierForMonths(months: number): TierDef | null {
  let out: TierDef | null = null;
  for (const t of TIERS) if (months >= t.months) out = t;
  return out;
}

/** "1 month", "6 months", "1 year", "5 years" — never "1 months". */
export function tierDuration(t: TierDef): string {
  if (t.months < 12) return `${t.months} month${t.months === 1 ? "" : "s"}`;
  const years = t.months / 12;
  return `${years} year${years === 1 ? "" : "s"}`;
}

export function nextTier(months: number): TierDef | null {
  return TIERS.find((t) => t.months > months) ?? null;
}

const MARK = (light: string, deep: string) => (
  <>
    <path d="M12 2.6 16.6 11 12 21.4 7.4 11Z" fill={light} opacity={0.95} />
    <path d="M12 7.4 14.3 11.4 12 17.4 9.7 11.4Z" fill={deep} opacity={0.55} />
    <path d="M4.2 17.6h5.2L6.8 13.2Z" fill={light} opacity={0.8} />
    <path d="M14.6 17.6h5.2L17.2 13.2Z" fill={light} opacity={0.8} />
  </>
);

export function SubscriptionMedallion({
  tier, super: isSuper = false, size = 128, className = "",
}: { tier: TierDef; super?: boolean; size?: number; className?: string }) {
  const rid = useId().replace(/:/g, "");
  const box = 128;
  const c = box / 2;
  const r = 50;
  const markScale = (r * 1.06) / 24;
  const off = c - 12 * markScale;

  // Opal is every tier before it, blended and blurred into one surface — the
  // last tier visibly contains the ones you passed through to reach it.
  const opal = tier.key === "opal";
  const blend = [...TIERS.slice(0, 6).map((t) => t.base), TIERS[5].light, TIERS[2].light];

  return (
    <svg width={size} height={size} viewBox={`0 0 ${box} ${box}`} className={className} aria-hidden>
      <defs>
        <radialGradient id={`g${rid}`} cx="38%" cy="30%">
          <stop offset="0%" stopColor={tier.light} />
          <stop offset="62%" stopColor={tier.base} />
          <stop offset="100%" stopColor={tier.deep} />
        </radialGradient>
        <clipPath id={`c${rid}`}><circle cx={c} cy={c} r={r} /></clipPath>
        <filter id={`f${rid}`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation={r * 0.2} />
        </filter>
      </defs>

      {isSuper && <circle cx={c} cy={c} r={r + 7} fill={tier.base} fillOpacity={0.18} />}

      {opal ? (
        <>
          <g clipPath={`url(#c${rid})`}>
            <circle cx={c} cy={c} r={r} fill="#dfe9f2" />
            <g filter={`url(#f${rid})`}>
              {blend.map((col, i) => {
                const a = ((i * 360) / blend.length - 60) * (Math.PI / 180);
                return (
                  <circle key={i} cx={c + Math.cos(a) * r * 0.52} cy={c + Math.sin(a) * r * 0.52}
                    r={r * 0.58} fill={col} fillOpacity={0.92} />
                );
              })}
            </g>
          </g>
          <circle cx={c} cy={c} r={r} fill="none" stroke="#fff" strokeOpacity={0.85} strokeWidth={2} />
          <circle cx={c} cy={c} r={r * 0.72} fill="#2b4a5c" fillOpacity={0.78} />
          <circle cx={c} cy={c} r={r * 0.72} fill="none" stroke="#fff" strokeOpacity={0.55} strokeWidth={1.2} />
        </>
      ) : (
        <>
          <circle cx={c} cy={c} r={r} fill={`url(#g${rid})`} />
          <circle cx={c} cy={c} r={r} fill="none" stroke={tier.light} strokeOpacity={0.85} strokeWidth={2} />
          <circle cx={c} cy={c} r={r * 0.72} fill={tier.deep} fillOpacity={0.85} />
          <circle cx={c} cy={c} r={r * 0.72} fill="none" stroke={tier.light} strokeOpacity={0.5} strokeWidth={1.2} />
        </>
      )}

      <g transform={`translate(${off},${off}) scale(${markScale})`}>{MARK(tier.light, tier.deep)}</g>

      {isSuper && [0, 90, 180, 270].map((deg) => {
        const a = (deg - 90) * (Math.PI / 180);
        const sx = c + Math.cos(a) * r;
        const sy = c + Math.sin(a) * r;
        return (
          <path key={deg} d={`M${sx} ${sy - 5} ${sx + 5} ${sy} ${sx} ${sy + 5} ${sx - 5} ${sy}Z`}
            fill={tier.light} />
        );
      })}
    </svg>
  );
}

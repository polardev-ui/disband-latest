"use client";

import { useState } from "react";
import { usePresence } from "@/hooks/usePresence";
import { Tooltip } from "@/components/discord/Tooltip";
import { BadgeGlyph } from "@/lib/badge-icons";
import { BadgeArt, hasBadgeArt } from "@/components/ui/BadgeArt";
import { useBadges, type AwardedBadge } from "@/lib/badge-store";
import { useEntitlement } from "@/lib/entitlement-store";
import { SubscriptionMedallion, tierForMonths, type TierDef } from "@/components/gift/SubscriptionMedallion";
import { SubscriptionBadgeModal } from "@/components/subscription/SubscriptionBadgeModal";
import type { SubscriptionPlan } from "@/lib/subscription";

const IDENTITY_BADGES = new Set(["owner", "staff", "moderator", "partner", "og"]);

export interface UserBadgesProps {
  userId: string | null | undefined;

  plan?: SubscriptionPlan;

  tenureMonths?: number;
  subscribedSince?: string | null;
  size?: number;
  className?: string;

  interactive?: boolean;

  variant?: "inline" | "full";
}

export function UserBadges({
  userId, plan, tenureMonths, subscribedSince,
  size = 13, className = "", interactive = true, variant = "inline",
}: UserBadgesProps) {

  const all = useBadges(userId, { fresh: variant === "full" });
  const full = variant === "full";
  const badges = full ? all : all.filter((b) => IDENTITY_BADGES.has(b.key));

  const ent = useEntitlement(userId);
  const [showTiers, setShowTiers] = useState(false);

  const effectivePlan: SubscriptionPlan =
    plan && plan !== "free" ? plan : ent.plan;
  // Tenure starts at zero on day one (and some platforms never report a
  // first-month stamp at all), but anyone on a paid plan has earned at
  // least the base medallion — show Bronze rather than nothing.
  const months = Math.max(1, tenureMonths ?? ent.months);
  const since = subscribedSince ?? ent.since;

  const tier: TierDef | null =
    !full || effectivePlan === "free" ? null : tierForMonths(months);

  const tiersOpen = showTiers && !!tier && effectivePlan !== "free";
  const { mounted: tiersMounted, exiting: tiersExiting } = usePresence(tiersOpen);
  if (badges.length === 0 && !tier) return null;

  return (
    <>
      <span
        className={
          full
            ? `flex flex-wrap items-center gap-0.5 ${className}`
            : `inline-flex shrink-0 items-center gap-1 ${className}`
        }
      >
        {tier && (
          <Tooltip
            as="span"
            side="top"
            disabled={tiersOpen}
            label={
              <span className="block text-center">
                <span className="block">Disband {effectivePlan === "lite" ? "Lite" : "Aero"}</span>
                <span className="mt-0.5 block text-[11px] font-normal text-[#b5bac1]">
                  {tier.label} · {interactive ? "click for details" : `${months} months`}
                </span>
              </span>
            }
          >
            {interactive ? (
              <button
                type="button"
                onClick={() => setShowTiers(true)}
                aria-label={`${effectivePlan === "lite" ? "Lite" : "Aero"} subscriber, ${tier.label} tier`}
                className="inline-flex shrink-0 items-center"
              >
                <SubscriptionMedallion tier={tier} super={effectivePlan !== "lite"} size={size} />
              </button>
            ) : (
              <span className="inline-flex shrink-0 items-center">
                <SubscriptionMedallion tier={tier} super={effectivePlan !== "lite"} size={size} />
              </span>
            )}
          </Tooltip>
        )}

        {badges.map((badge) => (
          <BadgePip key={badge.key} badge={badge} size={size} />
        ))}
      </span>

      {tiersMounted && tier && effectivePlan !== "free" && (
        <SubscriptionBadgeModal
          plan={effectivePlan}
          tenureMonths={months}
          since={since}
          exiting={tiersExiting}
          onClose={() => setShowTiers(false)}
        />
      )}
    </>
  );
}

/**
 How many pips the full variant draws (badges plus the Aero medallion).
 Profile cards use it to choose between the classic header box, which holds
 one row, and a wrapping row inside the card for long collections.
*/
export function useBadgeCount(userId: string | null | undefined, plan?: SubscriptionPlan): number {
  const badges = useBadges(userId, { fresh: true });
  const ent = useEntitlement(userId);
  const effective = plan && plan !== "free" ? plan : ent.plan;
  return badges.length + (effective !== "free" ? 1 : 0);
}

/** The header box beside the avatar fits one row of 22px badges. */
export const HEADER_BADGE_LIMIT = 8;

function BadgePip({ badge, size }: { badge: AwardedBadge; size: number }) {
  const detail = badgeDetail(badge);
  return (
    <Tooltip
      as="span"
      side="top"
      label={
        <span className="block text-center">
          <span className="block">{badge.name}</span>
          <span className="mt-0.5 block text-[11px] font-normal text-[#b5bac1]">
            {badge.description}
          </span>
          {detail && (
            <span className="mt-0.5 block text-[11px] font-normal text-[#8b9198]">{detail}</span>
          )}
        </span>
      }
    >
      {hasBadgeArt(badge.key) ? (
        // Classic badges stand on their own: no tinted disc behind the art.
        <span className="inline-flex shrink-0 items-center justify-center">
          <BadgeArt badgeKey={badge.key} size={size} />
        </span>
      ) : (
        <span
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
          style={{ color: badge.accent, backgroundColor: `${badge.accent}2e` }}
        >
          <BadgeGlyph badgeKey={badge.key} size={size} />
        </span>
      )}
    </Tooltip>
  );
}

function badgeDetail(badge: AwardedBadge): string | null {
  const m = badge.metadata ?? {};
  const n = (k: string) => (typeof m[k] === "number" ? (m[k] as number) : null);
  const reports = n("reports");
  if (reports) return `${reports} confirmed report${reports === 1 ? "" : "s"}`;
  const members = n("members");
  if (members) return `${members} members`;
  const servers = n("servers");
  if (servers) return `${servers} spaces`;
  const joined = n("joined");
  if (joined) return `${joined} joined`;
  const uploaded = n("uploaded");
  if (uploaded) return `${uploaded} emoji`;
  const minutes = n("minutes");
  if (minutes) return `${Math.floor(minutes / 60)} hours in calls`;
  if (typeof m.since === "string") {
    return `Since ${new Date(m.since).toLocaleDateString()}`;
  }
  return null;
}

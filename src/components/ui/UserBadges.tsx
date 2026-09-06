"use client";

import { useState } from "react";
import { Tooltip } from "@/components/discord/Tooltip";
import { BadgeGlyph } from "@/lib/badge-icons";
import { useBadges, type AwardedBadge } from "@/lib/badge-store";
import { SubscriptionMedallion, tierForMonths, type TierDef } from "@/components/gift/SubscriptionMedallion";
import { SubscriptionBadgeModal } from "@/components/subscription/SubscriptionBadgeModal";
import type { SubscriptionPlan } from "@/lib/subscription";

/**
 * The badges on a profile.
 *
 * These used to be four booleans on the profile row, hardcoded against a list
 * in this file. They come from the database now, so a badge can be added or
 * awarded without shipping a client — which is the only way twenty-five of
 * them, most awarded automatically, could work.
 */

export interface UserBadgesProps {
  userId: string | null | undefined;
  /** Shown ahead of the earned badges when the person is subscribed. */
  plan?: SubscriptionPlan;
  /** Paid months so far, which chooses the medallion's tier. */
  tenureMonths?: number;
  subscribedSince?: string | null;
  size?: number;
  className?: string;
  /** Whether the subscription medallion opens the tier breakdown. */
  interactive?: boolean;
}

export function UserBadges({
  userId, plan = "free", tenureMonths = 0, subscribedSince,
  size = 13, className = "", interactive = true,
}: UserBadgesProps) {
  const badges = useBadges(userId);
  const [showTiers, setShowTiers] = useState(false);

  const tier: TierDef | null = plan === "free" ? null : tierForMonths(tenureMonths);
  if (badges.length === 0 && !tier) return null;

  return (
    <>
      <span className={`inline-flex shrink-0 items-center gap-1 ${className}`}>
        {tier && (
          <Tooltip
            as="span"
            side="top"
            label={
              <span className="block text-center">
                <span className="block">{plan === "super" ? "Disband Super" : "Disband Basic"}</span>
                <span className="mt-0.5 block text-[11px] font-normal text-[#b5bac1]">
                  {tier.label} · {interactive ? "click for details" : `${tenureMonths} months`}
                </span>
              </span>
            }
          >
            {interactive ? (
              <button
                type="button"
                onClick={() => setShowTiers(true)}
                aria-label={`${plan === "super" ? "Super" : "Basic"} subscriber, ${tier.label} tier`}
                className="inline-flex shrink-0 items-center transition-transform hover:scale-110"
              >
                <SubscriptionMedallion tier={tier} super={plan === "super"} size={size + 7} />
              </button>
            ) : (
              <span className="inline-flex shrink-0 items-center">
                <SubscriptionMedallion tier={tier} super={plan === "super"} size={size + 7} />
              </span>
            )}
          </Tooltip>
        )}

        {badges.map((badge) => (
          <BadgePip key={badge.key} badge={badge} size={size} />
        ))}
      </span>

      {showTiers && tier && plan !== "free" && (
        <SubscriptionBadgeModal
          plan={plan}
          tenureMonths={tenureMonths}
          since={subscribedSince ?? null}
          onClose={() => setShowTiers(false)}
        />
      )}
    </>
  );
}

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
      <span
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
        style={{ color: badge.accent, backgroundColor: `${badge.accent}2e` }}
      >
        <BadgeGlyph badgeKey={badge.key} size={size} />
      </span>
    </Tooltip>
  );
}

/** The count or date an automatic award recorded, when it has one. */
function badgeDetail(badge: AwardedBadge): string | null {
  const m = badge.metadata ?? {};
  const n = (k: string) => (typeof m[k] === "number" ? (m[k] as number) : null);
  const reports = n("reports");
  if (reports) return `${reports} confirmed report${reports === 1 ? "" : "s"}`;
  const members = n("members");
  if (members) return `${members} members`;
  const servers = n("servers");
  if (servers) return `${servers} servers`;
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

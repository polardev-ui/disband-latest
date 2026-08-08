import type { ComponentType } from "react";
import type { Profile } from "@/lib/supabase/types";
import { IconBounty, IconCrown, IconOG, IconStaff } from "@/components/icons";
import { Tooltip } from "@/components/discord/Tooltip";

type IconType = ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;

export interface UserBadgeDef {
  key: "owner" | "staff" | "og" | "bounty";
  Icon: IconType;
  color: string;
  bg: string;
  title: string;
  subtitle: string;
}

export const PLATFORM_BADGES: UserBadgeDef[] = [
  {
    key: "owner",
    Icon: IconCrown,
    color: "#faa61a",
    bg: "rgba(250, 166, 26, 0.18)",
    title: "Disband Owner",
    subtitle: "Owner and Founder of Disband",
  },
  {
    key: "staff",
    Icon: IconStaff,
    color: "#8ea1e1",
    bg: "rgba(142, 161, 225, 0.18)",
    title: "Disband Staff",
    subtitle: "Member of the Disband staff team",
  },
  {
    key: "og",
    Icon: IconOG,
    color: "#f04747",
    bg: "rgba(240, 71, 71, 0.18)",
    title: "OG",
    subtitle: "Joined Disband during its early days",
  },
  {
    key: "bounty",
    Icon: IconBounty,
    color: "#43b581",
    bg: "rgba(67, 181, 129, 0.18)",
    title: "Bug Bounty Hunter",
    subtitle: "Helped find and report bugs in Disband",
  },
];

export interface UserBadgesProps {
  profile: Pick<
    Profile,
    "show_owner_badge" | "show_staff_badge" | "show_og_badge" | "show_bounty_badge"
  >;
  size?: number;
  className?: string;
}

export function badgeDefsFor(
  profile: Pick<
    Profile,
    "show_owner_badge" | "show_staff_badge" | "show_og_badge" | "show_bounty_badge"
  >,
): UserBadgeDef[] {
  const defs: UserBadgeDef[] = [];
  if (profile.show_owner_badge) defs.push(PLATFORM_BADGES[0]);
  if (profile.show_staff_badge) defs.push(PLATFORM_BADGES[1]);
  if (profile.show_og_badge) defs.push(PLATFORM_BADGES[2]);
  if (profile.show_bounty_badge) defs.push(PLATFORM_BADGES[3]);
  return defs;
}

export function UserBadges({ profile, size = 13, className = "" }: UserBadgesProps) {
  const defs = badgeDefsFor(profile);
  if (defs.length === 0) return null;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 ${className}`}>
      {defs.map((badge) => (
        <Tooltip
          key={badge.key}
          as="span"
          side="top"
          label={
            <span className="block text-center">
              <span className="block">{badge.title}</span>
              <span className="mt-0.5 block text-[11px] font-normal text-[#b5bac1]">
                {badge.subtitle}
              </span>
            </span>
          }
        >
          <span
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
            style={{ color: badge.color, backgroundColor: badge.bg }}
          >
            <badge.Icon size={size} strokeWidth={2} />
          </span>
        </Tooltip>
      ))}
    </span>
  );
}

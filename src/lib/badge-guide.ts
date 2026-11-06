/**
 * How each profile badge is earned, for the public /badges page.
 *
 * Names, descriptions and colours come from the badges table; this only adds
 * what that table doesn't hold. Keep it in step with refresh_user_badges and
 * the staff tools that award the manual badges.
 */

export type BadgeAvailability =
  | { kind: "open" }
  | { kind: "until"; date: string; label: string }
  | { kind: "staff" }
  | { kind: "retired" };

export interface BadgeGuide {
  howTo: string;
  availability: BadgeAvailability;
}

const UNTIL_2027 = { kind: "until", date: "2027-01-01T00:00:00Z", label: "31 December 2026" } as const;

export const BADGE_GUIDE: Record<string, BadgeGuide> = {
  owner: { howTo: "Held by the founder of Disband. There's only one.", availability: { kind: "staff" } },
  manager: { howTo: "Given to the person who runs the Disband staff and moderation teams.", availability: { kind: "staff" } },
  staff: { howTo: "Given to members of the Disband staff team.", availability: { kind: "staff" } },
  moderator: { howTo: "Given to members of the platform moderation team.", availability: { kind: "staff" } },
  partner: { howTo: "Given to owners of spaces accepted into the Disband Partner programme.", availability: { kind: "staff" } },
  og: { howTo: "Given to people who joined in Disband's early days. It can't be earned any more.", availability: { kind: "retired" } },
  early: {
    howTo: "Subscribe to Aero or Lite, or receive either as a gift, before the end of 2026. You keep it after that, even if your plan ends.",
    availability: UNTIL_2027,
  },
  donor: {
    howTo: "Donate to Disband while logged in, with your name shown on the donor wall. The badge shows how much you've given in total. Anonymous donations don't count, so they stay anonymous.",
    availability: { kind: "open" },
  },
  anniv: { howTo: "Have your account for a full year.", availability: { kind: "open" } },
  bot_dev: { howTo: "Register a bot in the Developer Portal.", availability: { kind: "open" } },
  bot_ver: { howTo: "Have one of your bots added to 50 or more spaces.", availability: { kind: "open" } },
  contrib: { howTo: "Get a code contribution accepted into Disband.", availability: { kind: "staff" } },
  translate: { howTo: "Contribute a translation that ships in the app.", availability: { kind: "staff" } },
  bounty: { howTo: "Report bugs through the bug bounty programme. Given by staff.", availability: { kind: "staff" } },
  hunter: { howTo: "Send in a bug report that staff confirm.", availability: { kind: "open" } },
  hunter2: { howTo: "Have ten of your bug reports confirmed.", availability: { kind: "open" } },
  security: { howTo: "Responsibly report a security vulnerability to the Disband team.", availability: { kind: "staff" } },
  feedback: { howTo: "Have ten of your reports accepted.", availability: { kind: "open" } },
  creator: { howTo: "Be a verified content creator with 2,500 or more followers. Apply through support.", availability: { kind: "staff" } },
  founder: { howTo: "Own a space that grows past 100 members.", availability: { kind: "open" } },
  server_v: { howTo: "Own a space that Disband has verified.", availability: { kind: "open" } },
  boost: { howTo: "Boost a space with Catalysts. It goes away when you stop boosting.", availability: { kind: "open" } },
  recruit: { howTo: "Have 25 people join Disband or your spaces through your invites or referral link.", availability: { kind: "open" } },
  emoji: { howTo: "Upload 25 custom emoji to your spaces.", availability: { kind: "open" } },
  gift: { howTo: "Gift an Aero or Lite subscription to someone.", availability: { kind: "open" } },
  beta: { howTo: "Help test a pre-release build of Disband.", availability: { kind: "staff" } },
  mobile: { howTo: "Sign in to the Disband iPhone or Android app before the end of 2026.", availability: UNTIL_2027 },
  voice: { howTo: "Spend 100 hours in voice calls.", availability: { kind: "open" } },
};

export type Rarity = "Legendary" | "Epic" | "Rare" | "Uncommon" | "Common";

/** Rarity from the share of accounts holding the badge. */
export function rarityFor(holders: number, users: number): Rarity {
  const share = users > 0 ? holders / users : 0;
  if (share < 0.0005) return "Legendary";
  if (share < 0.005) return "Epic";
  if (share < 0.05) return "Rare";
  if (share < 0.2) return "Uncommon";
  return "Common";
}

export const RARITY_COLOURS: Record<Rarity, string> = {
  Legendary: "#f0b232",
  Epic: "#b57bff",
  Rare: "#4f9dff",
  Uncommon: "#3ba55d",
  Common: "#9aa0a8",
};

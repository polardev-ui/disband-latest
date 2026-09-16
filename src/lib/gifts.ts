/** Gifting follows the plans that exist, and there is only one paid plan. */
export type GiftPlan = "aero";

/** The only lengths a gift can be bought in. A year is the ceiling. */
export const GIFT_MONTHS = [1, 3, 6, 12] as const;
export type GiftMonths = (typeof GIFT_MONTHS)[number];

/**
 * What each length costs, in cents.
 *
 * The price rises with every step up, and longer gifts carry a discount
 * against buying the same span a month at a time — a year is 8,999 rather
 * than 12 × 899. Kept as an explicit table rather than a formula so the
 * numbers on the buy screen are the numbers charged, with no rounding drift
 * between the two.
 */
export const GIFT_PRICING: Record<GiftPlan, Record<GiftMonths, number>> = {
  aero: { 1: 899, 3: 2549, 6: 4799, 12: 8999 },
};

export const GIFT_PLAN_NAME: Record<GiftPlan, string> = {
  aero: "Disband Aero",
};

export function giftPrice(plan: GiftPlan, months: GiftMonths): number {
  return GIFT_PRICING[plan][months];
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function monthsLabel(months: number): string {
  if (months === 12) return "1 year";
  return `${months} month${months === 1 ? "" : "s"}`;
}

/** Per-month equivalent, for showing what a longer gift saves. */
export function savingsPercent(plan: GiftPlan, months: GiftMonths): number {
  const monthly = GIFT_PRICING[plan][1];
  const full = monthly * months;
  const actual = GIFT_PRICING[plan][months];
  return Math.round(((full - actual) / full) * 100);
}

export function isGiftPlan(v: unknown): v is GiftPlan {
  return v === "aero";
}

/**
 * The plan a stored gift grants.
 *
 * Gift links minted before Basic and Super were merged are still out there,
 * unredeemed and paid for. They grant Aero now — which is the same or more
 * than was bought — rather than failing to resolve to a plan that exists.
 */
export function normalizeGiftPlan(_stored: unknown): GiftPlan {
  return "aero";
}

export function isGiftMonths(v: unknown): v is GiftMonths {
  return typeof v === "number" && (GIFT_MONTHS as readonly number[]).includes(v);
}

/**
 * Gift links in message text.
 *
 * Mirrors how server invites are matched, including the leading-URL and
 * case-insensitive handling — phone keyboards capitalise the start of a
 * message, and "Https://" should still resolve.
 */
const GIFT_RE = /(?:https?:\/\/[^\s]+)?\/gift\/([a-zA-Z0-9]{10})\b/gi;

export function extractGiftCodes(text: string): string[] {
  const codes = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(GIFT_RE.source, "gi");
  while ((m = re.exec(text)) !== null) codes.add(m[1]);
  return [...codes];
}

export function giftUrl(code: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}/gift/${code}`;
}

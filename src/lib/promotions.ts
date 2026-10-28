/** Paid placement at the top of Discover. Prices are fixed here and on the server. */
export interface PromotionPlan {
  days: number;
  label: string;
  cents: number;
}

export const PROMOTION_PLANS: PromotionPlan[] = [
  { days: 1, label: "1 day", cents: 1000 },
  { days: 3, label: "3 days", cents: 1700 },
  { days: 5, label: "5 days", cents: 2500 },
  { days: 7, label: "1 week", cents: 3200 },
  { days: 14, label: "2 weeks", cents: 5000 },
];

export function promotionPlan(days: number): PromotionPlan | null {
  return PROMOTION_PLANS.find((p) => p.days === days) ?? null;
}

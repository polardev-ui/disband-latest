import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    _stripe = new Stripe(key, {
      apiVersion: "2026-06-24.dahlia",
    });
  }
  return _stripe;
}

export const PRICE_IDS = {
  basic: process.env.STRIPE_BASIC_PRICE_ID!,
  super: process.env.STRIPE_SUPER_PRICE_ID!,
} as const;

export type PlanPriceId = keyof typeof PRICE_IDS;

export function getPriceId(plan: "basic" | "super"): string {
  return PRICE_IDS[plan];
}

export const PLANS_MONTHLY_CENTS: Record<string, number> = {
  basic: 299,
  super: 899,
};

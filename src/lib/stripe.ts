import Stripe from "stripe";
import type { SubscriptionPlan } from "@/lib/subscription";

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

/**
 * Prices, current and historical.
 *
 * `aero` is the one thing for sale. `legacyBasic` is kept only so a
 * subscription created before the merge can still be recognised by its price
 * when its metadata says nothing — reading it is not the same as selling it.
 *
 * Aero deliberately reuses Super's price id: the seven people already paying
 * are on that price, and pointing the new plan at a new price would have
 * meant migrating live subscriptions for no reason.
 */
export const PRICE_IDS = {
  aero: process.env.STRIPE_AERO_PRICE_ID || process.env.STRIPE_SUPER_PRICE_ID!,
  legacyBasic: process.env.STRIPE_BASIC_PRICE_ID ?? "",
  /** One-time Disband Catalyst price from the product catalogue. */
  catalyst: process.env.STRIPE_CATALYST_PRICE_ID!,
} as const;

export type PlanPriceId = keyof typeof PRICE_IDS;

export function getPriceId(plan: SubscriptionPlan): string {
  if (plan !== "aero") {
    throw new Error(`No price for plan "${plan}" — only Aero is for sale.`);
  }
  return PRICE_IDS.aero;
}

/** Catalogue price for one Catalyst (one-time). Actionable when unconfigured. */
export function getCatalystPriceId(): string {
  const id = PRICE_IDS.catalyst;
  if (!id || !id.startsWith("price_")) {
    throw new Error(
      'Invalid catalyst price id: expected a "price_..." value from STRIPE_CATALYST_PRICE_ID',
    );
  }
  return id;
}

export const PLANS_MONTHLY_CENTS: Record<string, number> = {
  aero: 899,
};

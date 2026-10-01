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

export const PRICE_IDS = {
  aero: process.env.STRIPE_AERO_PRICE_ID || process.env.STRIPE_SUPER_PRICE_ID!,
  aeroYearly: process.env.STRIPE_AERO_YEARLY_PRICE_ID ?? "",
  lite: process.env.STRIPE_LITE_PRICE_ID ?? "",
  liteYearly: process.env.STRIPE_LITE_YEARLY_PRICE_ID ?? "",
  legacyBasic: process.env.STRIPE_BASIC_PRICE_ID ?? "",

  catalyst: process.env.STRIPE_CATALYST_PRICE_ID!,
} as const;

export type PlanPriceId = keyof typeof PRICE_IDS;

export type PaidPlan = "aero" | "lite";

export function getPriceId(plan: PaidPlan, interval: "month" | "year" = "month"): string {
  const key = interval === "year" ? `${plan}Yearly` : plan;
  const id = PRICE_IDS[key as PlanPriceId];
  if (!id || !id.startsWith("price_")) {
    throw new Error(
      `No ${interval}ly price for plan "${plan}" — check STRIPE_${plan.toUpperCase()}_PRICE_ID` +
        (interval === "year" ? "_YEARLY." : "."),
    );
  }
  return id;
}

export function getCatalystPriceId(): string {
  const id = PRICE_IDS.catalyst;
  if (!id || !id.startsWith("price_")) {
    throw new Error(
      'Invalid catalyst price id: expected a "price_..." value from STRIPE_CATALYST_PRICE_ID',
    );
  }
  return id;
}

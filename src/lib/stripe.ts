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

/*
 EU/UK consumers have 14 days to cancel a purchase, unless they ask for a
 digital purchase to start straight away and acknowledge they lose that right
 (Terms, Section 9). Stripe Checkout shows this as a required checkbox next
 to the Terms. It needs a Terms of Service URL in the Stripe account's public
 details; if that's missing, Stripe refuses the session, so checkout falls
 back to no checkbox rather than breaking payments, and logs it loudly.
*/
const WITHDRAWAL_CONSENT = {
  consent_collection: { terms_of_service: "required" },
  custom_text: {
    terms_of_service_acceptance: {
      message:
        "I agree to the [Terms of Service](https://disband.dev/terms) and ask for my purchase to start straight " +
        "away. I understand that once it starts, I lose my right to cancel within 14 days.",
    },
  },
} satisfies Partial<Stripe.Checkout.SessionCreateParams>;

export async function createCheckoutSession(
  params: Stripe.Checkout.SessionCreateParams,
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  try {
    return await stripe.checkout.sessions.create({ ...params, ...WITHDRAWAL_CONSENT });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/terms of service/i.test(message)) throw err;
    console.error(
      "[stripe] Checkout consent checkbox is off: set a Terms of Service URL in Stripe → Settings → Public details.",
      message,
    );
    return stripe.checkout.sessions.create(params);
  }
}

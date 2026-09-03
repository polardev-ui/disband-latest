import { loadStripe, type Stripe } from "@stripe/stripe-js";

/**
 * Stripe.js, loaded once.
 *
 * The key is read at build time — `NEXT_PUBLIC_*` values are inlined into the
 * bundle, not read from the environment at runtime — so a deployment built
 * without it ships `undefined` and every checkout fails. It previously did so
 * as an unhandled rejection from inside Stripe's own code ("Expected
 * publishable key to be of type string"), which says nothing about which
 * variable is missing or where to set it.
 */
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

export class StripeNotConfiguredError extends Error {
  constructor() {
    super(
      "Payments are unavailable: NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY was not set "
        + "when this build was created. Set it in the deployment environment and redeploy.",
    );
    this.name = "StripeNotConfiguredError";
  }
}

/** True when the build carries a publishable key. */
export function isStripeConfigured(): boolean {
  return typeof PUBLISHABLE_KEY === "string" && PUBLISHABLE_KEY.length > 0;
}

let stripePromise: Promise<Stripe | null> | undefined;

export function getStripe(): Promise<Stripe | null> {
  if (!isStripeConfigured()) {
    // Rejects with something diagnosable instead of letting Stripe.js throw a
    // type error about a value the caller never passed.
    console.error(new StripeNotConfiguredError().message);
    return Promise.reject(new StripeNotConfiguredError());
  }
  if (!stripePromise) {
    stripePromise = loadStripe(PUBLISHABLE_KEY as string);
  }
  return stripePromise;
}

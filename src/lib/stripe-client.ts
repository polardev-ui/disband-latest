import { loadStripe, type Stripe } from "@stripe/stripe-js";

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

export function isStripeConfigured(): boolean {
  return typeof PUBLISHABLE_KEY === "string" && PUBLISHABLE_KEY.length > 0;
}

let stripePromise: Promise<Stripe | null> | undefined;

export function getStripe(): Promise<Stripe | null> {
  if (!isStripeConfigured()) {

    console.error(new StripeNotConfiguredError().message);
    return Promise.reject(new StripeNotConfiguredError());
  }
  if (!stripePromise) {
    stripePromise = loadStripe(PUBLISHABLE_KEY as string);
  }
  return stripePromise;
}

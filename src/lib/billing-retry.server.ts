import "server-only";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { getServiceSupabase } from "@/lib/supabase/server";

/**
 * Failed-payment policy for Aero and Lite: one charge attempt a day, and the
 * subscription is cancelled 14 days after the first failure.
 *
 * Stripe's own retry schedule can't express that (it allows a handful of
 * attempts, not one a day for two weeks), so its automatic retries are meant
 * to be off and this sweep does the work. It runs daily from pg_cron.
 *
 * The clock starts when the unpaid invoice was finalised, which is when
 * Stripe made the first attempt. The member keeps their plan while the
 * subscription is past_due (see GRANTING_STATUSES).
 */
export const RETRY_GRACE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export type RetryOutcome = {
  checked: number;
  retried: number;
  recovered: number;
  canceled: number;
  errors: number;
};

function failedSince(invoice: Stripe.Invoice): number | null {
  const finalized = invoice.status_transitions?.finalized_at ?? invoice.created;
  return finalized ? finalized * 1000 : null;
}

async function markCanceled(subscriptionId: string) {
  // The customer.subscription.deleted webhook does the same; doing it here
  // too means a missed webhook can't leave someone on a plan they stopped
  // paying for.
  const service = getServiceSupabase();
  if (!service) return;
  await service
    .from("subscriptions")
    .update({
      plan: "free",
      status: "canceled",
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscriptionId);
}

export async function runPaymentRetries(now = Date.now()): Promise<RetryOutcome> {
  const stripe = getStripe();
  const outcome: RetryOutcome = { checked: 0, retried: 0, recovered: 0, canceled: 0, errors: 0 };
  const today = new Date(now).toISOString().slice(0, 10);

  for await (const sub of stripe.subscriptions.list({
    status: "past_due",
    limit: 100,
    expand: ["data.latest_invoice"],
  })) {
    outcome.checked += 1;
    const invoice = sub.latest_invoice as Stripe.Invoice | null;
    if (!invoice || typeof invoice === "string" || invoice.status !== "open" || !invoice.id) continue;

    const since = failedSince(invoice);
    if (since === null) continue;
    const daysFailing = (now - since) / DAY_MS;

    try {
      if (daysFailing >= RETRY_GRACE_DAYS) {
        await stripe.subscriptions.cancel(sub.id, {}, { idempotencyKey: `dunning-cancel-${sub.id}` });
        await markCanceled(sub.id);
        outcome.canceled += 1;
        continue;
      }

      // Stripe's own attempt on the day of failure counts as that day's try.
      if (daysFailing < 1) continue;

      // The idempotency key holds this to one real attempt per invoice per
      // UTC day, even if the sweep is run twice.
      try {
        const paid = await stripe.invoices.pay(
          invoice.id,
          { off_session: true },
          { idempotencyKey: `dunning-retry-${invoice.id}-${today}` },
        );
        outcome.retried += 1;
        if (paid.status === "paid") outcome.recovered += 1;
      } catch (err) {
        // A decline is the expected failure here, not an error in the sweep.
        // Stripe still sends invoice.payment_failed for it, and the email for
        // an invoice only goes out once.
        if ((err as { type?: string }).type === "StripeCardError") {
          outcome.retried += 1;
        } else {
          throw err;
        }
      }
    } catch (err) {
      outcome.errors += 1;
      console.error("Payment retry failed for", sub.id, err);
    }
  }

  return outcome;
}

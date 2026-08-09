import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type Stripe from "stripe";
import { getStripe, PRICE_IDS } from "@/lib/stripe";
import { GRANTING_STATUSES } from "@/lib/subscription";
import { getServiceSupabase } from "@/lib/supabase/server";
import { PUBLIC_ENV } from "@/lib/public-env";

/**
 * Reconcile the signed-in user's subscription straight from Stripe.
 *
 * The webhook is the primary path, but it is a single point of failure: if its
 * endpoint URL or signing secret is wrong, the customer is charged and the app
 * never learns about it. This endpoint asks Stripe what the user actually has
 * and writes it, so a purchase applies even when the webhook does not fire.
 *
 * Safe to call repeatedly — it is an idempotent upsert keyed on user_id.
 */

interface StripePeriodFields {
  current_period_start?: number;
  current_period_end?: number;
  canceled_at?: number | null;
}

/** Map a Stripe price back to one of our plans. */
function planForSubscription(sub: Stripe.Subscription): "basic" | "super" | null {
  const metaPlan = (sub.metadata as Record<string, string> | undefined)?.plan;
  if (metaPlan === "basic" || metaPlan === "super") return metaPlan;

  // Fall back to the price id, so subscriptions created outside our checkout
  // (dashboard, migrations) still resolve.
  for (const item of sub.items?.data ?? []) {
    const priceId = item.price?.id;
    if (!priceId) continue;
    if (priceId === PRICE_IDS.basic) return "basic";
    if (priceId === PRICE_IDS.super) return "super";
  }
  return null;
}

function rank(sub: Stripe.Subscription): number {
  if (sub.status === "active" || sub.status === "trialing") return 3;
  if (sub.status === "past_due") return 2;
  return 1;
}

export async function POST() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(PUBLIC_ENV.supabaseUrl, PUBLIC_ENV.supabaseAnonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const admin = getServiceSupabase();
    if (!admin) {
      return NextResponse.json(
        { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY" },
        { status: 500 },
      );
    }

    const stripe = getStripe();

    // Collect every subscription that could belong to this user: those tagged
    // with their id, plus anything under a customer with their email.
    const found: Stripe.Subscription[] = [];

    try {
      const search = await stripe.subscriptions.search({
        query: `metadata['user_id']:'${user.id}'`,
        limit: 20,
      });
      found.push(...search.data);
    } catch {
      // Search is unavailable on some accounts — the email path below covers it.
    }

    if (user.email) {
      const customers = await stripe.customers.list({ email: user.email, limit: 10 });
      for (const customer of customers.data) {
        const subs = await stripe.subscriptions.list({
          customer: customer.id,
          status: "all",
          limit: 20,
        });
        found.push(...subs.data);
      }
    }

    if (found.length === 0) {
      return NextResponse.json({ synced: false, reason: "no_stripe_subscription" });
    }

    // Prefer a granting subscription, most recently created wins ties.
    const best = found
      .filter((s) => planForSubscription(s) !== null)
      .sort((a, b) => rank(b) - rank(a) || b.created - a.created)[0];

    if (!best) {
      return NextResponse.json({ synced: false, reason: "no_matching_plan" });
    }

    const plan = planForSubscription(best)!;
    const fields = best as unknown as StripePeriodFields;
    const granting = GRANTING_STATUSES.has(best.status);

    const { error } = await admin.from("subscriptions").upsert(
      {
        user_id: user.id,
        plan: granting ? plan : "free",
        status: best.status,
        stripe_subscription_id: best.id,
        stripe_customer_id: typeof best.customer === "string" ? best.customer : best.customer?.id,
        current_period_start: fields.current_period_start
          ? new Date(fields.current_period_start * 1000).toISOString()
          : null,
        current_period_end: fields.current_period_end
          ? new Date(fields.current_period_end * 1000).toISOString()
          : null,
        canceled_at: fields.canceled_at ? new Date(fields.canceled_at * 1000).toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (error) {
      console.error("Subscription sync upsert failed:", error);
      return NextResponse.json({ error: "Failed to save subscription" }, { status: 500 });
    }

    return NextResponse.json({
      synced: true,
      plan: granting ? plan : "free",
      status: best.status,
    });
  } catch (err) {
    console.error("Subscription sync error:", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}

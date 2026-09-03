import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getServiceSupabase } from "@/lib/supabase/server";
import type Stripe from "stripe";

function toISOStringSafe(timestamp: number | null | undefined): string | null {
  if (!timestamp || typeof timestamp !== "number") return null;
  const date = new Date(timestamp * 1000);
  return isNaN(date.getTime()) ? null : date.toISOString();
}

function extractSubscriptionPeriods(sub: Stripe.Subscription) {
  const item = sub.items?.data?.[0];
  
  // Extract period start & end from items[0] or top-level fallback
  const startTimestamp = item?.current_period_start ?? (sub as unknown as { current_period_start?: number }).current_period_start;
  const endTimestamp = item?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end;
  
  const canceledAtTimestamp = sub.canceled_at ?? (sub as unknown as { canceled_at?: number }).canceled_at;

  return {
    periodStart: toISOStringSafe(startTimestamp) ?? new Date().toISOString(),
    periodEnd: toISOStringSafe(endTimestamp) ?? new Date().toISOString(),
    canceledAt: toISOStringSafe(canceledAtTimestamp),
  };
}

async function upsertSubscription(
  userId: string,
  plan: "basic" | "super",
  status: string,
  subscriptionId: string,
  customerId: string,
  periodStartISO: string,
  periodEndISO: string,
  canceledAtISO: string | null,
) {
  const supabase = getServiceSupabase();
  if (!supabase) return;
  await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      plan,
      status,
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: customerId,
      current_period_start: periodStartISO,
      current_period_end: periodEndISO,
      canceled_at: canceledAtISO,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
}

async function cancelSubscription(subscriptionId: string) {
  const supabase = getServiceSupabase();
  if (!supabase) return;
  await supabase
    .from("subscriptions")
    .update({ plan: "free", status: "canceled", updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", subscriptionId);
}

function getMetadata(sub: Stripe.Subscription): Record<string, string> {
  return sub.metadata ?? {};
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error(
      "Stripe webhook signature verification failed. Check that " +
        "STRIPE_WEBHOOK_SECRET matches this endpoint's signing secret.",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id;
        const plan = session.metadata?.plan as "basic" | "super" | undefined;
        const subId = session.subscription as string;
        const customerId = session.customer as string;

        if (userId && plan && subId) {
          const sub = await getStripe().subscriptions.retrieve(subId);
          const periods = extractSubscriptionPeriods(sub);
          await upsertSubscription(
            userId,
            plan,
            sub.status,
            subId,
            customerId,
            periods.periodStart,
            periods.periodEnd,
            periods.canceledAt,
          );
        }
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const invSubId = (invoice as unknown as { subscription: string | null }).subscription;
        if (invSubId) {
          const sub = await getStripe().subscriptions.retrieve(invSubId);
          const meta = getMetadata(sub);
          const userId = meta.user_id;
          const plan = meta.plan as "basic" | "super" | undefined;
          if (userId && plan) {
            const periods = extractSubscriptionPeriods(sub);
            await upsertSubscription(
              userId,
              plan,
              sub.status,
              invSubId,
              sub.customer as string,
              periods.periodStart,
              periods.periodEnd,
              periods.canceledAt,
            );
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const updatedSub = event.data.object as Stripe.Subscription;
        const meta = getMetadata(updatedSub);
        const userId2 = meta.user_id;
        const plan2 = meta.plan as "basic" | "super" | undefined;

        if (updatedSub.status === "canceled" || updatedSub.status === "unpaid" || updatedSub.status === "incomplete_expired") {
          await cancelSubscription(updatedSub.id);
        } else if (userId2 && plan2) {
          const periods = extractSubscriptionPeriods(updatedSub);
          await upsertSubscription(
            userId2,
            plan2,
            updatedSub.status,
            updatedSub.id,
            updatedSub.customer as string,
            periods.periodStart,
            periods.periodEnd,
            periods.canceledAt,
          );
        }
        break;
      }

      case "customer.subscription.deleted": {
        const deletedSub = event.data.object as Stripe.Subscription;
        await cancelSubscription(deletedSub.id);
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
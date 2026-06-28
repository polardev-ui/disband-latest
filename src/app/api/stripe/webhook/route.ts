import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getSupabaseClient } from "@/lib/supabase/client";
import type Stripe from "stripe";

interface SubscriptionFields {
  current_period_start: number;
  current_period_end: number;
  canceled_at: number | null;
}

async function upsertSubscription(
  userId: string,
  plan: "basic" | "super",
  status: string,
  subscriptionId: string,
  customerId: string,
  periodStart: number,
  periodEnd: number,
  canceledAt: number | null,
) {
  const supabase = getSupabaseClient();
  await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      plan,
      status,
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: customerId,
      current_period_start: new Date(periodStart * 1000).toISOString(),
      current_period_end: new Date(periodEnd * 1000).toISOString(),
      canceled_at: canceledAt ? new Date(canceledAt * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
}

async function cancelSubscription(subscriptionId: string) {
  const supabase = getSupabaseClient();
  await supabase
    .from("subscriptions")
    .update({ plan: "free", status: "canceled", updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", subscriptionId);
}

function getSubFields(sub: Stripe.Subscription): SubscriptionFields {
  return sub as unknown as SubscriptionFields;
}

function getMetadata(sub: Stripe.Subscription): Record<string, string> {
  return (sub as unknown as { metadata: Record<string, string> }).metadata ?? {};
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
  } catch {
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
          const fields = getSubFields(sub);
          await upsertSubscription(
            userId,
            plan,
            sub.status,
            subId,
            customerId,
            fields.current_period_start,
            fields.current_period_end,
            fields.canceled_at,
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
            const fields = getSubFields(sub);
            await upsertSubscription(
              userId,
              plan,
              sub.status,
              invSubId,
              sub.customer as string,
              fields.current_period_start,
              fields.current_period_end,
              fields.canceled_at,
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
          const fields = getSubFields(updatedSub);
          await upsertSubscription(
            userId2,
            plan2,
            updatedSub.status,
            updatedSub.id,
            updatedSub.customer as string,
            fields.current_period_start,
            fields.current_period_end,
            fields.canceled_at,
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

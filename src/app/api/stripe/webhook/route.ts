import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getServiceSupabase } from "@/lib/supabase/server";
import type Stripe from "stripe";
import { normalizePlan, type SubscriptionPlan } from "@/lib/subscription";

function toISOStringSafe(timestamp: number | null | undefined): string | null {
  if (!timestamp || typeof timestamp !== "number") return null;
  const date = new Date(timestamp * 1000);
  return isNaN(date.getTime()) ? null : date.toISOString();
}

function extractSubscriptionPeriods(sub: Stripe.Subscription) {
  const item = sub.items?.data?.[0];

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
  plan: SubscriptionPlan,
  status: string,
  subscriptionId: string,
  customerId: string,
  periodStartISO: string,
  periodEndISO: string,
  canceledAtISO: string | null,
) {
  const supabase = getServiceSupabase();
  if (!supabase) throw new Error("Database unavailable");
  const { error: upsertError } = await supabase.from("subscriptions").upsert(
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

  if (upsertError) throw new Error(upsertError.message);

  const { error: updateError } = await supabase
    .from("subscriptions")
    .update({ first_subscribed_at: periodStartISO })
    .eq("user_id", userId)
    .is("first_subscribed_at", null);
  if (updateError) throw new Error(updateError.message);
}

async function accrueTenure(userId: string, invoiceId: string) {
  const supabase = getServiceSupabase();
  if (!supabase) throw new Error("Database unavailable");
  const { error } = await supabase.rpc("accrue_tenure_invoice", { p_user: userId, p_invoice_id: invoiceId });
  if (error) throw new Error(error.message);
}

async function cancelSubscription(subscriptionId: string) {
  const supabase = getServiceSupabase();
  if (!supabase) throw new Error("Database unavailable");
  const { error: updateError } = await supabase
    .from("subscriptions")
    .update({ plan: "free", status: "canceled", updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", subscriptionId);
  if (updateError) throw new Error(updateError.message);
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
      case "checkout.session.async_payment_succeeded":
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        if (session.metadata?.kind === "gift") {          const giftId = session.metadata.gift_id;
          const supabase = getServiceSupabase();
          if (giftId && supabase && session.payment_status === "paid") {
            const { error } = await supabase
              .from("gifts")
              .update({ status: "unclaimed" })
              .eq("id", giftId)
              .eq("status", "pending");
            if (error) throw new Error(error.message);
          }
          break;
        }

        if (session.metadata?.kind === "catalyst") {
          const supabase = getServiceSupabase();
          const buyerId = session.metadata.user_id;
          const serverId = session.metadata.server_id;
          const qty = Math.max(
            1,
            Math.min(99, parseInt(session.metadata.quantity ?? "1", 10) || 1),
          );
          if (supabase && buyerId && serverId && session.payment_status === "paid") {

            const { data: existing } = await supabase
              .from("server_catalysts")
              .select("id")
              .eq("stripe_session_id", session.id)
              .limit(1);
            if (!existing || existing.length === 0) {
              const rows = Array.from({ length: qty }, () => ({
                server_id: serverId,
                user_id: buyerId,
                source: "purchase",
                stripe_session_id: session.id,
              }));
              const { error } = await supabase.from("server_catalysts").insert(rows);
              if (error) throw new Error(error.message);
            }
          }
          break;
        }

        const userId = session.metadata?.user_id;

        const plan = session.metadata?.plan ? normalizePlan(session.metadata.plan) : undefined;
        const subId = session.subscription as string;
        const customerId = session.customer as string;

        if (userId && plan === "aero" && subId) {
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
        const invSubId = invoice.parent?.subscription_details?.subscription
          ?? (invoice as unknown as { subscription: string | null }).subscription;
        if (invSubId) {
          const sub = await getStripe().subscriptions.retrieve(typeof invSubId === "string" ? invSubId : invSubId.id);
          const meta = getMetadata(sub);
          const userId = meta.user_id;
          const plan = meta.plan ? normalizePlan(meta.plan) : undefined;
          if (userId && plan === "aero") {
            const periods = extractSubscriptionPeriods(sub);
            await upsertSubscription(
              userId,
              plan,
              sub.status,
              sub.id,
              sub.customer as string,
              periods.periodStart,
              periods.periodEnd,
              periods.canceledAt,
            );
            await accrueTenure(userId, invoice.id);
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const updatedSub = event.data.object as Stripe.Subscription;
        const meta = getMetadata(updatedSub);
        const userId2 = meta.user_id;
        const plan2 = meta.plan ? normalizePlan(meta.plan) : undefined;

        if (updatedSub.status === "canceled" || updatedSub.status === "unpaid" || updatedSub.status === "incomplete_expired") {
          await cancelSubscription(updatedSub.id);
        } else if (userId2 && plan2 === "aero") {
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

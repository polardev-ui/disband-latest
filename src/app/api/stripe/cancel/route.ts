import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { getRouteUser, getServiceSupabase } from "@/lib/supabase/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

function periodEnd(sub: Stripe.Subscription): string | null {
  const item = sub.items?.data?.[0];
  const timestamp =
    item?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end;
  return timestamp ? new Date(timestamp * 1000).toISOString() : null;
}

/**
 * Stop or resume renewal of the caller's Stripe subscription.
 *
 * Cancelling here is deliberately non-refundable and period-end based: the
 * caller keeps the plan until the paid period ends, and Stripe stops the next
 * invoice. App Store subscriptions cannot be changed from our servers; the
 * iOS client sends those to Apple's own manage-subscriptions sheet.
 */
export async function POST(req: Request) {
  try {
    const user = await getRouteUser(req);
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const limit = rateLimit(`billing:cancel:${user.id}`, 6, 60_000);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

    const body = (await req.json().catch(() => ({}))) as { resume?: boolean };
    const resume = body.resume === true;

    const supabase = getServiceSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Billing is not configured." }, { status: 500 });
    }

    const { data: row, error: readError } = await supabase
      .from("subscriptions")
      .select("stripe_subscription_id, provider, status, current_period_end")
      .eq("user_id", user.id)
      .maybeSingle();

    if (readError) {
      console.error("Stripe cancel read failed:", readError);
      return NextResponse.json({ error: "Could not read your subscription." }, { status: 500 });
    }

    if (!row) {
      return NextResponse.json({ error: "No subscription found." }, { status: 404 });
    }
    if (row.provider === "apple") {
      return NextResponse.json(
        { error: "App Store subscriptions are managed by Apple." },
        { status: 409 },
      );
    }
    if (!row.stripe_subscription_id) {
      return NextResponse.json(
        { error: "Only card subscriptions can be cancelled here." },
        { status: 409 },
      );
    }
    if (row.status === "canceled") {
      return NextResponse.json(
        { error: "This subscription has already ended." },
        { status: 409 },
      );
    }

    const updated = await getStripe().subscriptions.update(row.stripe_subscription_id, {
      cancel_at_period_end: !resume,
    });

    const end = periodEnd(updated) ?? row.current_period_end;
    const { error: updateError } = await supabase
      .from("subscriptions")
      .update({
        cancel_at_period_end: !resume,
        canceled_at: resume ? null : new Date().toISOString(),
        current_period_end: end,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (updateError) {
      console.error("Stripe cancel write failed:", updateError);
      return NextResponse.json(
        { error: "Stripe was updated, but your account could not be refreshed." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      cancel_at_period_end: !resume,
      current_period_end: end,
    });
  } catch (err) {
    console.error("Stripe cancel error:", err);
    return NextResponse.json(
      { error: "Could not update your subscription. Please try again." },
      { status: 500 },
    );
  }
}

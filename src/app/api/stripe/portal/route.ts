import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getRouteUser, getServiceSupabase } from "@/lib/supabase/server";
import { checkoutOrigin } from "@/lib/checkout-origin";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export async function GET(req: Request) {
  try {
    const user = await getRouteUser(req);
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const supabase = getServiceSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Billing is not configured." }, { status: 500 });
    }
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .single();

    if (!sub?.stripe_customer_id) {
      return NextResponse.json({ error: "No subscription found" }, { status: 404 });
    }

    const limit = rateLimit(`checkout:stripe/portal:${user.id}`, 10, 60_000);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    const origin = checkoutOrigin(req);
    const portal = await getStripe().billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${origin}/app`,
    });

    return NextResponse.json({ url: portal.url });
  } catch (err) {
    console.error("Stripe portal error:", err);
    return NextResponse.json({ error: "Failed to create portal" }, { status: 500 });
  }
}

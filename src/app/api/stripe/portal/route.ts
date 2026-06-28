import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getSupabaseClient } from "@/lib/supabase/client";

export async function GET(req: Request) {
  try {
    const { data: { session: s } } = await getSupabaseClient().auth.getSession();
    if (!s?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: sub } = await getSupabaseClient()
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", s.user.id)
      .single();

    if (!sub?.stripe_customer_id) {
      return NextResponse.json({ error: "No subscription found" }, { status: 404 });
    }

    const origin = req.headers.get("origin") ?? "http://localhost:3000";
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

import { NextResponse } from "next/server";
import { getStripe, getPriceId } from "@/lib/stripe";
import { getSupabaseClient } from "@/lib/supabase/client";

export async function POST(req: Request) {
  try {
    const { data: { session: s } } = await getSupabaseClient().auth.getSession();
    if (!s?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { plan } = (await req.json()) as { plan: "basic" | "super" };
    if (plan !== "basic" && plan !== "super") {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const origin = req.headers.get("origin") ?? "http://localhost:3000";
    const priceId = getPriceId(plan);

    const session = await getStripe().checkout.sessions.create({
      ui_mode: "elements",
      customer_email: s.user.email,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      return_url: `${origin}/app`,
      metadata: { user_id: s.user.id, plan },
      client_reference_id: s.user.id,
      subscription_data: {
        metadata: { user_id: s.user.id, plan },
      },
    });

    return NextResponse.json({ clientSecret: session.client_secret });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return NextResponse.json({ error: "Failed to create checkout" }, { status: 500 });
  }
}

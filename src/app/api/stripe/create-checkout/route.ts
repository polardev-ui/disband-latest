import { NextResponse } from "next/server";
import { getStripe, getPriceId } from "@/lib/stripe";
import { getRouteUser } from "@/lib/supabase/server";
import { checkoutOrigin } from "@/lib/checkout-origin";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { normalizePlan } from "@/lib/subscription";

export async function POST(req: Request) {
  try {
    const user = await getRouteUser(req);
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { plan: requested } = (await req.json()) as { plan: string };
    const plan = normalizePlan(requested);
    if (plan !== "aero") {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const limit = rateLimit(`checkout:stripe/create-checkout:${user.id}`, 10, 60_000);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    const origin = checkoutOrigin(req);
    const priceId = getPriceId(plan);

    if (!priceId || !priceId.startsWith("price_")) {
      console.error(
        `Invalid price id for plan "${plan}": expected a "price_..." value from ` +
          `STRIPE_${plan.toUpperCase()}_PRICE_ID`,
      );
      return NextResponse.json(
        { error: "Billing is not configured correctly. Please contact support." },
        { status: 500 },
      );
    }

    const session = await getStripe().checkout.sessions.create({
      ui_mode: "elements",
      customer_email: user.email,
      mode: "subscription",

      allow_promotion_codes: true,
      line_items: [{ price: priceId, quantity: 1 }],
      return_url: `${origin}/app`,
      metadata: { user_id: user.id, plan },
      client_reference_id: user.id,
      subscription_data: {
        metadata: { user_id: user.id, plan },
      },
    });

    return NextResponse.json({ clientSecret: session.client_secret });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    const message = err instanceof Error ? err.message : "";

    if (/STRIPE_SECRET_KEY/.test(message)) {
      return NextResponse.json(
        { error: "Billing is not configured on this space yet." },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: "Failed to create checkout" }, { status: 500 });
  }
}

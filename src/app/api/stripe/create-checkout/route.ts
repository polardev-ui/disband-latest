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

    // Legacy names are still accepted from older clients and resolve to the
    // one plan that exists, so a stale tab does not fail at checkout.
    const { plan: requested } = (await req.json()) as { plan: string };
    const plan = normalizePlan(requested);
    if (plan !== "aero") {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const limit = rateLimit(`checkout:stripe/create-checkout:${user.id}`, 10, 60_000);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    const origin = checkoutOrigin(req);
    const priceId = getPriceId(plan);

    // Misconfigured price ids used to surface as an opaque 500 from Stripe.
    // Fail here with something actionable instead.
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
      // Lets the buyer redeem a promotion code from inside our own checkout UI
      // via checkout.applyPromotionCode().
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
    // Missing server config is our fault, not a card problem — say so plainly
    // rather than leaving the buyer staring at a generic failure.
    if (/STRIPE_SECRET_KEY/.test(message)) {
      return NextResponse.json(
        { error: "Billing is not configured on this server yet." },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: "Failed to create checkout" }, { status: 500 });
  }
}

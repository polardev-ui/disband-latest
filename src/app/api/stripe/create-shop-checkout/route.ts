import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getRouteUser, getServiceSupabase } from "@/lib/supabase/server";
import { checkoutOrigin } from "@/lib/checkout-origin";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

/**
 * Buy one shop cosmetic.
 *
 * The price is read from `shop_items` on the server and passed to Stripe as
 * `price_data`. Forty-one items would otherwise mean forty-one Stripe Price
 * objects to create and keep in step; more importantly, taking the amount from
 * the request body would let anyone name their own price.
 */
export async function POST(req: Request) {
  try {
    const user = await getRouteUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { item_id } = (await req.json()) as { item_id?: unknown };
    if (typeof item_id !== "string" || !item_id) {
      return NextResponse.json({ error: "Pick an item." }, { status: 400 });
    }

    const limit = rateLimit(`checkout:shop:${user.id}`, 10, 60_000);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

    const supabase = getServiceSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Shop is unavailable right now." }, { status: 500 });
    }

    const { data: item } = await supabase
      .from("shop_items")
      .select("id, name, description, price_cents, active")
      .eq("id", item_id)
      .maybeSingle();

    if (!item || item.active === false) {
      return NextResponse.json({ error: "That item is no longer available." }, { status: 404 });
    }

    // Cosmetics are permanent, so a second purchase would take money for
    // nothing. Checked here as well as in the webhook's upsert.
    const { data: owned } = await supabase
      .from("user_shop_items")
      .select("item_id")
      .eq("user_id", user.id)
      .eq("item_id", item.id)
      .maybeSingle();
    if (owned) {
      return NextResponse.json({ error: "You already own this." }, { status: 409 });
    }

    const origin = checkoutOrigin(req);
    const session = await getStripe().checkout.sessions.create({
      ui_mode: "elements",
      mode: "payment",
      customer_email: user.email,
      allow_promotion_codes: true,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: item.price_cents,
            product_data: {
              name: `Disband Shop — ${item.name}`,
              description: item.description,
            },
          },
        },
      ],
      return_url: `${origin}/app?shop=${encodeURIComponent(item.id)}`,
      metadata: {
        kind: "shop",
        user_id: user.id,
        item_id: item.id,
      },
    });

    return NextResponse.json({
      clientSecret: session.client_secret,
      unitAmount: item.price_cents,
      currency: "usd",
    });
  } catch (err) {
    console.error("Stripe shop checkout error:", err);
    const message = err instanceof Error ? err.message : "";
    if (/STRIPE_SECRET_KEY/.test(message)) {
      return NextResponse.json({ error: "Billing is not configured yet." }, { status: 500 });
    }
    return NextResponse.json({ error: "Failed to start checkout" }, { status: 500 });
  }
}

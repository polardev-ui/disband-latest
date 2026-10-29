import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getRouteUser, getServiceSupabase } from "@/lib/supabase/server";
import { checkoutOrigin } from "@/lib/checkout-origin";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { effectivePriceCents, isShopItemAvailable, shopItem } from "@/lib/shop";

/**
 * Buy one shop cosmetic, for yourself or as a gift to a friend
 * (`recipient_id`), who receives it when the payment clears.
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

    const { item_id, recipient_id } = (await req.json()) as { item_id?: unknown; recipient_id?: unknown };
    const recipientId = typeof recipient_id === "string" && recipient_id ? recipient_id : null;
    // It goes into a filter below, so it must be exactly a UUID.
    if (recipientId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recipientId)) {
      return NextResponse.json({ error: "Pick a friend." }, { status: 400 });
    }
    if (recipientId === user.id) {
      return NextResponse.json({ error: "Buy it for yourself instead." }, { status: 400 });
    }
    if (typeof item_id !== "string" || !item_id) {
      return NextResponse.json({ error: "Pick an item." }, { status: 400 });
    }
    const catalogueItem = shopItem(item_id);
    if (!catalogueItem || !isShopItemAvailable(catalogueItem)) {
      return NextResponse.json({ error: "That item is no longer available." }, { status: 404 });
    }

    const limit = rateLimit(`checkout:shop:${user.id}`, 10, 60_000);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

    const supabase = getServiceSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Shop is unavailable right now." }, { status: 500 });
    }

    const { data: item } = await supabase
      .from("shop_items")
      .select("id, name, description, price_cents, sale_price_cents, active")
      .eq("id", item_id)
      .maybeSingle();

    if (!item || item.active === false) {
      return NextResponse.json({ error: "That item is no longer available." }, { status: 404 });
    }

    // Charge the live sale price when the row has a valid one. Revalidated
    // here (not trusted from the client) so a crafted request cannot set its
    // own price — effectivePriceCents rejects anything that is not positive
    // and strictly below the regular price.
    const chargeCents = effectivePriceCents(item.price_cents, item.sale_price_cents);

    // Gifts go to friends only: a stranger can't be sent things unasked.
    let recipientName: string | null = null;
    if (recipientId) {
      const [{ data: friendship }, { data: recipient }] = await Promise.all([
        supabase
          .from("friendships")
          .select("id")
          .eq("status", "accepted")
          .or(`and(requester_id.eq.${user.id},addressee_id.eq.${recipientId}),and(requester_id.eq.${recipientId},addressee_id.eq.${user.id})`)
          .maybeSingle(),
        supabase.from("profiles").select("display_name, username, is_bot").eq("id", recipientId).maybeSingle(),
      ]);
      if (!recipient || recipient.is_bot) return NextResponse.json({ error: "That person can't receive gifts." }, { status: 404 });
      if (!friendship) return NextResponse.json({ error: "You can only gift to friends." }, { status: 403 });
      recipientName = recipient.display_name || recipient.username || "your friend";
    }

    // Cosmetics are permanent, so a second purchase would take money for
    // nothing. Checked here as well as in the webhook's upsert.
    const ownerId = recipientId ?? user.id;
    const { data: owned } = await supabase
      .from("user_shop_items")
      .select("item_id")
      .eq("user_id", ownerId)
      .eq("item_id", item.id)
      .maybeSingle();
    if (owned) {
      return NextResponse.json({ error: recipientId ? `${recipientName} already has this.` : "You already own this." }, { status: 409 });
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
            unit_amount: chargeCents,
            product_data: {
              name: recipientId ? `Disband Shop — ${item.name} (gift for ${recipientName})` : `Disband Shop — ${item.name}`,
              description: item.description,
            },
          },
        },
      ],
      return_url: `${origin}/app?shop=${encodeURIComponent(item.id)}${recipientId ? "&gift=1" : ""}`,
      metadata: {
        kind: "shop",
        user_id: user.id,
        item_id: item.id,
        ...(recipientId ? { recipient_id: recipientId } : {}),
      },
    });

    return NextResponse.json({
      clientSecret: session.client_secret,
      unitAmount: chargeCents,
      listAmount: item.price_cents,
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

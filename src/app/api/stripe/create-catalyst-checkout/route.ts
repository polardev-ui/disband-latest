import { NextResponse } from "next/server";
import { getCatalystPriceId, getStripe } from "@/lib/stripe";
import { getRouteUser } from "@/lib/supabase/server";
import { checkoutOrigin } from "@/lib/checkout-origin";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { formatCents } from "@/lib/catalysts";

export async function GET() {
  try {
    const price = await getStripe().prices.retrieve(getCatalystPriceId());
    return NextResponse.json({
      unitAmount: price.unit_amount ?? 0,
      currency: price.currency,
      type: price.type,
    });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }
}
export async function POST(req: Request) {
  try {
    const user = await getRouteUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { server_id, quantity } = (await req.json()) as {
      server_id?: unknown;
      quantity?: unknown;
    };
    if (typeof server_id !== "string" || !server_id) {
      return NextResponse.json({ error: "Pick a server." }, { status: 400 });
    }
    const qty = typeof quantity === "number" ? Math.floor(quantity) : NaN;
    if (!Number.isFinite(qty) || qty < 1 || qty > 99) {
      return NextResponse.json({ error: "Quantity must be 1–99." }, { status: 400 });
    }

    const limit = rateLimit(`checkout:catalysts:${user.id}`, 10, 60_000);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    const origin = checkoutOrigin(req);

    let priceId: string;
    try {
      priceId = getCatalystPriceId();
    } catch {
      return NextResponse.json(
        { error: "Catalyst billing is not configured correctly. Please contact support." },
        { status: 500 },
      );
    }
    const price = await getStripe().prices.retrieve(priceId);
    if (price.type !== "one_time") {
      console.error(
        `Catalyst price ${priceId} is "${price.type}" — switch it to one-time in the Stripe product catalogue.`,
      );
      return NextResponse.json(
        { error: "Catalyst billing is not configured correctly. Please contact support." },
        { status: 500 },
      );
    }
    const unitAmount = price.unit_amount ?? 0;

    const session = await getStripe().checkout.sessions.create({
      ui_mode: "elements",
      mode: "payment",
      customer_email: user.email,
      allow_promotion_codes: true,
      line_items: [{ price: priceId, quantity: qty }],
      return_url: `${origin}/app?catalysts=${server_id}`,
      metadata: {
        kind: "catalyst",
        user_id: user.id,
        server_id,
        quantity: String(qty),
      },
    });

    return NextResponse.json({
      clientSecret: session.client_secret,
      total: formatCents(unitAmount * qty),
      unitAmount,
      currency: price.currency,
    });
  } catch (err) {
    console.error("Stripe catalyst checkout error:", err);
    const message = err instanceof Error ? err.message : "";
    if (/STRIPE_SECRET_KEY/.test(message)) {
      return NextResponse.json(
        { error: "Billing is not configured on this server yet." },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: "Failed to start checkout" }, { status: 500 });
  }
}

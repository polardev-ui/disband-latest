import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getRouteUser, getServiceSupabase } from "@/lib/supabase/server";

import { PUBLIC_ENV } from "@/lib/public-env";
import {
  GIFT_PLAN_NAME, giftPrice, isGiftMonths, isGiftPlan, monthsLabel,
} from "@/lib/gifts";

/**
 * Buy a gift subscription.
 *
 * One-time payment rather than a subscription: the person paying is not the
 * person who ends up with the plan, so there is nothing to renew against
 * them. Prices are built inline from our own table so a length can be added
 * without creating and wiring another Stripe price id.
 */

const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function giftCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export async function POST(req: Request) {
  try {
    const user = await getRouteUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { plan, months } = (await req.json()) as { plan?: unknown; months?: unknown };
    if (!isGiftPlan(plan)) {
      return NextResponse.json({ error: "Pick Basic or Super." }, { status: 400 });
    }
    if (!isGiftMonths(months)) {
      return NextResponse.json(
        { error: "Gifts can be 1, 3, 6 or 12 months." }, { status: 400 },
      );
    }

    const amount = giftPrice(plan, months);
    const origin = req.headers.get("origin") ?? PUBLIC_ENV.webAppUrl;
    const code = giftCode();
    const supabase = getServiceSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Gifting is not configured." }, { status: 500 });
    }

    // Recorded before payment so the webhook has a row to flip, and so a
    // completed payment can never arrive with nowhere to land.
    const { data: gift, error } = await supabase
      .from("gifts")
      .insert({
        code, buyer_id: user.id, plan, months, amount_cents: amount, status: "pending",
      })
      .select("id, code")
      .single();

    if (error || !gift) {
      console.error("gift insert failed", error?.message);
      return NextResponse.json({ error: "Could not start the gift." }, { status: 500 });
    }

    const session = await getStripe().checkout.sessions.create({
      ui_mode: "elements",
      mode: "payment",
      customer_email: user.email,
      allow_promotion_codes: true,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: amount,
          product_data: {
            name: `${GIFT_PLAN_NAME[plan]} — ${monthsLabel(months)} gift`,
            description: "A gift subscription, claimable by whoever you send it to.",
          },
        },
      }],
      return_url: `${origin}/app?gift=${gift.code}`,
      metadata: { kind: "gift", gift_id: gift.id, code: gift.code, buyer_id: user.id, plan, months: String(months) },
    });

    await supabase
      .from("gifts")
      .update({ stripe_session_id: session.id })
      .eq("id", gift.id);

    return NextResponse.json({ clientSecret: session.client_secret, code: gift.code });
  } catch (err) {
    console.error("gift checkout error", err);
    return NextResponse.json({ error: "Failed to start checkout" }, { status: 500 });
  }
}

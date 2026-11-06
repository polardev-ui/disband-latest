import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getRouteUser, getServiceSupabase } from "@/lib/supabase/server";
import { checkoutOrigin } from "@/lib/checkout-origin";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { requireTurnstile } from "@/lib/turnstile";
import { cleanDonationMessage, formatUsd, validateDonationAmount } from "@/lib/donations";

export const dynamic = "force-dynamic";

/*
 Starts a one-off donation on Stripe's hosted checkout page.

 Signed in: the donor picks whether their name shows on the wall. Signed out:
 the donation always shows as anonymous, and a Turnstile check is required,
 because an open payment form is exactly what card testers look for.
*/
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      amountCents?: unknown;
      message?: unknown;
      showName?: unknown;
      turnstileToken?: unknown;
    };

    const amountError = validateDonationAmount(body.amountCents);
    if (amountError) return NextResponse.json({ error: amountError }, { status: 400 });
    const amountCents = body.amountCents as number;

    const { message, error: messageError } = cleanDonationMessage(body.message);
    if (messageError) return NextResponse.json({ error: messageError }, { status: 400 });

    const user = await getRouteUser(req);
    const ip = getClientIp(req);

    const limit = rateLimit(`donate:${user?.id ?? `ip:${ip}`}`, user ? 6 : 3, 10 * 60_000);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

    if (!user) {
      const blocked = await requireTurnstile(body.turnstileToken, { action: "donate", ip });
      if (blocked) return blocked;
    }

    const supabase = getServiceSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Donations aren't available right now. Please try again later." }, { status: 503 });
    }

    // Durable limits as well as the in-memory one above, which resets per instance.
    const key = user ? `donate:u:${user.id}` : `donate:ip:${ip}`;
    const { error: limited } = await supabase.rpc("platform_rate_limit", {
      p_key: key,
      p_max: user ? 10 : 5,
      p_window_seconds: 3600,
    });
    if (limited) {
      return NextResponse.json({ error: "Too many attempts. Please try again in a little while." }, { status: 429 });
    }

    const showName = !!user && body.showName === true;
    const { data: row, error: insertError } = await supabase
      .from("donations")
      .insert({ user_id: user?.id ?? null, show_name: showName, amount_cents: amountCents, message })
      .select("id")
      .single();
    if (insertError || !row) {
      console.error("[donate] Couldn't record pending donation:", insertError?.message);
      return NextResponse.json({ error: "Couldn't start your donation. Please try again." }, { status: 500 });
    }

    const origin = checkoutOrigin(req);
    const metadata = { kind: "donation", donation_id: row.id as string };
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      submit_type: "donate",
      customer_email: user?.email,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: amountCents,
          product_data: {
            name: "Donation to Disband",
            description: `A ${formatUsd(amountCents)} donation to help keep Disband running. Not tax-deductible.`,
          },
        },
      }],
      metadata,
      payment_intent_data: { metadata, description: "Donation to Disband" },
      success_url: `${origin}/donate?thanks=1`,
      cancel_url: `${origin}/donate`,
    });

    await supabase.from("donations").update({ stripe_session_id: session.id }).eq("id", row.id);

    if (!session.url) {
      return NextResponse.json({ error: "Couldn't start your donation. Please try again." }, { status: 500 });
    }
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[donate] Checkout error:", err);
    return NextResponse.json({ error: "Couldn't start your donation. Please try again." }, { status: 500 });
  }
}

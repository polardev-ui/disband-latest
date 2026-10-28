import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getRouteUser, getServiceSupabase } from "@/lib/supabase/server";
import { checkoutOrigin } from "@/lib/checkout-origin";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { promotionPlan } from "@/lib/promotions";

/**
 * Pay to put a space at the top of Discover for a number of days. The price
 * comes from the plan table, never the request. The webhook records the
 * promotion once Stripe confirms payment, stacking after any current run.
 */
export async function POST(req: Request) {
  try {
    const user = await getRouteUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const limit = rateLimit(`checkout:promotion:${user.id}`, 10, 60_000);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

    const { server_id, days } = (await req.json()) as { server_id?: unknown; days?: unknown };
    const plan = typeof days === "number" ? promotionPlan(days) : null;
    if (typeof server_id !== "string" || !plan) return NextResponse.json({ error: "Pick a space and a length." }, { status: 400 });

    const supabase = getServiceSupabase();
    if (!supabase) return NextResponse.json({ error: "Promotions are unavailable right now." }, { status: 500 });
    const { data: server } = await supabase.from("servers").select("id, name, owner_id, discoverable, suspended_at").eq("id", server_id).maybeSingle();
    if (!server) return NextResponse.json({ error: "No such space." }, { status: 404 });
    const { data: canManage } = await supabase.rpc("member_has_server_permission", { p_server_id: server.id, p_user_id: user.id, p_permission: "manage_server" });
    if (server.owner_id !== user.id && !canManage) return NextResponse.json({ error: "Only people who manage this space can promote it." }, { status: 403 });
    if (server.suspended_at) return NextResponse.json({ error: "This space is suspended." }, { status: 403 });
    if (!server.discoverable) return NextResponse.json({ error: "Turn on Discover for this space first (Overview → Discoverable)." }, { status: 409 });

    const origin = checkoutOrigin(req);
    const session = await getStripe().checkout.sessions.create({
      ui_mode: "elements",
      mode: "payment",
      customer_email: user.email,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: plan.cents,
          product_data: { name: `Discover promotion — ${server.name}`, description: `Top of Discover for ${plan.label}.` },
        },
      }],
      return_url: `${origin}/app?promoted=${encodeURIComponent(server.id)}`,
      metadata: { kind: "promotion", user_id: user.id, server_id: server.id, days: String(plan.days), cents: String(plan.cents) },
    });
    return NextResponse.json({ clientSecret: session.client_secret, unitAmount: plan.cents, currency: "usd" });
  } catch (err) {
    console.error("Stripe promotion checkout error:", err);
    const message = err instanceof Error ? err.message : "";
    if (/STRIPE_SECRET_KEY/.test(message)) return NextResponse.json({ error: "Billing is not configured yet." }, { status: 500 });
    return NextResponse.json({ error: "Failed to start checkout" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getRouteUser, getServiceSupabase } from "@/lib/supabase/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { LITE_MONTHLY_GRANT, MONTHLY_GRANT, monthStartIso } from "@/lib/catalysts";
import { GRANTING_STATUSES, normalizePlan, type SubscriptionPlan } from "@/lib/subscription";

/**
 * Spend one monthly Catalyst grant on a server.
 *
 * Since 0112 (catalyst counterfeit hole) clients cannot INSERT into
 * server_catalysts at all — writes come only from the Stripe webhook /
 * Apple IAP via the service role. That lockdown also killed the
 * legitimate path: Aero's "Boost this space" button has 403'd ever since.
 * This route restores it: the service role inserts, but only after
 * checking the caller's effective plan (subscription + active gifts) and
 * counting their grant rows this month. Aero gets 4, Lite gets 1.
 */
function effectivePlan(
  sub: { plan: string | null; status: string | null } | null,
  gifts: Array<{ plan: string | null; expires_at: string | null }> | null,
): SubscriptionPlan {
  const plans: SubscriptionPlan[] = [];
  if (sub && sub.status && GRANTING_STATUSES.has(sub.status)) {
    plans.push(normalizePlan(sub.plan));
  }
  const now = Date.now();
  for (const g of gifts ?? []) {
    if (!g.expires_at || new Date(g.expires_at).getTime() > now) {
      plans.push(normalizePlan(g.plan));
    }
  }
  if (plans.includes("aero")) return "aero";
  if (plans.includes("lite")) return "lite";
  return "free";
}

export async function POST(req: Request) {
  try {
    const user = await getRouteUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { server_id } = (await req.json()) as { server_id?: unknown };
    if (typeof server_id !== "string" || !server_id) {
      return NextResponse.json({ error: "Pick a space." }, { status: 400 });
    }

    const limit = rateLimit(`catalyst:allocate:${user.id}`, 20, 60_000);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

    const supabase = getServiceSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Billing service unavailable." }, { status: 500 });
    }

    const { data: server } = await supabase
      .from("servers")
      .select("id")
      .eq("id", server_id)
      .maybeSingle();
    if (!server) return NextResponse.json({ error: "Space not found." }, { status: 404 });

    const [{ data: sub }, { data: giftRows }] = await Promise.all([
      supabase
        .from("subscriptions")
        .select("plan,status")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("gift_entitlements")
        .select("plan,expires_at")
        .eq("user_id", user.id),
    ]);

    const plan = effectivePlan(
      (sub as { plan: string | null; status: string | null } | null) ?? null,
      (giftRows as Array<{ plan: string | null; expires_at: string | null }> | null) ?? null,
    );
    const grant = plan === "aero" ? MONTHLY_GRANT : plan === "lite" ? LITE_MONTHLY_GRANT : 0;
    if (grant === 0) {
      return NextResponse.json(
        { error: "Monthly Catalysts come with a paid plan — Aero gets 4, Lite gets 1." },
        { status: 403 },
      );
    }

    const monthStart = monthStartIso();
    const { count } = await supabase
      .from("server_catalysts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("source", "grant")
      .gte("created_at", monthStart);
    const used = count ?? 0;
    if (used >= grant) {
      return NextResponse.json({ error: "No monthly credits left." }, { status: 403 });
    }

    const { error } = await supabase
      .from("server_catalysts")
      .insert({ server_id, user_id: user.id, source: "grant" });
    if (error) {
      return NextResponse.json({ error: "Could not add catalyst." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, remaining: grant - used - 1 });
  } catch (err) {
    console.error("catalyst allocate failed", err);
    return NextResponse.json({ error: "Could not add catalyst." }, { status: 500 });
  }
}

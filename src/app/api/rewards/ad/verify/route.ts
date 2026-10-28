import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { adReward } from "@/lib/currency";

/**
 * Server-side verification callback from the ad network, once a rewarded
 * view completes. Signed with REWARDED_AD_SECRET:
 *   sig = hex(HMAC-SHA256(secret, `${view_id}:${seconds}`))
 * Pays once per view (the ledger's unique reference), for the seconds the
 * network says were watched.
 */
export async function GET(req: Request) {
  const secret = process.env.REWARDED_AD_SECRET;
  const supabase = getServiceSupabase();
  if (!secret || !supabase) return NextResponse.json({ ok: false }, { status: 503 });

  const url = new URL(req.url);
  const viewId = url.searchParams.get("view_id") ?? "";
  const seconds = Number(url.searchParams.get("seconds"));
  const sig = url.searchParams.get("sig") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(viewId) || !Number.isFinite(seconds) || seconds <= 0 || !/^[0-9a-f]{64}$/i.test(sig)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const expected = createHmac("sha256", secret).update(`${viewId}:${Math.floor(seconds)}`).digest();
  if (!timingSafeEqual(expected, Buffer.from(sig, "hex"))) return NextResponse.json({ ok: false }, { status: 401 });

  const { data: view } = await supabase.from("ad_views").select("id, user_id, started_at, verified_at").eq("id", viewId).maybeSingle();
  if (!view) return NextResponse.json({ ok: false }, { status: 404 });
  if (view.verified_at) return NextResponse.json({ ok: true, already: true });
  // A view can't have run longer than the time since it started.
  const elapsed = (Date.now() - Date.parse(view.started_at)) / 1000;
  const watched = Math.min(Math.floor(seconds), Math.floor(elapsed));
  const reward = adReward(watched);

  await supabase.from("ad_views").update({ verified_at: new Date().toISOString(), seconds: watched, reward }).eq("id", viewId).is("verified_at", null);
  if (reward > 0) {
    await supabase.rpc("wallet_apply", { p_user: view.user_id, p_amount: reward, p_reason: "ad", p_ref: viewId, p_daily_cap: 8000 });
  }
  return NextResponse.json({ ok: true, reward });
}

import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { AD_DAILY_CAP, AD_REWARD } from "@/lib/currency";

/**
 * AppLixir's server callback, once a rewarded view completes (mode
 * md5AndTid). The userId is the ad_views id the page passed in, and
 *   signature = md5(gameApiKey + gameId + userId + tid + secret)
 * Pays once per view. AppLixir does not retry, so answer 2xx quickly.
 */
export async function GET(req: Request) {
  const secret = process.env.APPLIXIR_CALLBACK_SECRET;
  const supabase = getServiceSupabase();
  if (!secret || !supabase) return NextResponse.json({ ok: false }, { status: 503 });

  const q = new URL(req.url).searchParams;
  const gameApiKey = q.get("gameApiKey") ?? "";
  const gameId = q.get("gameId") ?? "";
  const viewId = q.get("userId") ?? "";
  const tid = q.get("tid") ?? "";
  const signature = q.get("signature") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(viewId) || !tid || !/^[0-9a-f]{32}$/i.test(signature)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (process.env.APPLIXIR_API_KEY && gameApiKey !== process.env.APPLIXIR_API_KEY) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const expected = createHash("md5").update(gameApiKey + gameId + viewId + tid + secret).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) return NextResponse.json({ ok: false }, { status: 401 });

  const { data: view } = await supabase.from("ad_views").select("id, user_id, verified_at").eq("id", viewId).maybeSingle();
  if (!view) return NextResponse.json({ ok: false }, { status: 404 });
  if (view.verified_at) return NextResponse.json({ ok: true, already: true });

  const { data: claimed } = await supabase.from("ad_views")
    .update({ verified_at: new Date().toISOString(), reward: AD_REWARD })
    .eq("id", viewId).is("verified_at", null).select("id");
  if (!claimed?.length) return NextResponse.json({ ok: true, already: true });
  const { data: paid } = await supabase.rpc("wallet_apply", {
    p_user: view.user_id, p_amount: AD_REWARD, p_reason: "ad", p_ref: viewId, p_daily_cap: AD_DAILY_CAP,
  });
  // Over the daily cap: the view still counts, it just pays nothing.
  if (!paid) await supabase.from("ad_views").update({ reward: 0 }).eq("id", viewId);
  return NextResponse.json({ ok: true, reward: paid ? AD_REWARD : 0 });
}

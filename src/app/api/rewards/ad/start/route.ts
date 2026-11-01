import { NextResponse } from "next/server";
import { getRouteUser, getServiceSupabase } from "@/lib/supabase/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { AD_DAILY_CAP, AD_REWARD } from "@/lib/currency";

/*
 Rewarded video ads, through AppLixir.

 Payment never trusts the browser: this route opens a view and the page hands
 its id to AppLixir as the userId. AppLixir's signed server callback
 (../verify) carries it back and is the only thing that pays, once per view.
*/

const DAILY_VIEWS = Math.ceil(AD_DAILY_CAP / AD_REWARD);

function apiKey(): string | null {
  return process.env.APPLIXIR_API_KEY || null;
}

/** Whether ads are set up, so the wallet can show or hide the button. */
export async function GET() {
  return NextResponse.json({ ready: !!apiKey() && !!process.env.APPLIXIR_CALLBACK_SECRET });
}

export async function POST(req: Request) {
  const user = await getRouteUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const key = apiKey();
  const supabase = getServiceSupabase();
  if (!key || !process.env.APPLIXIR_CALLBACK_SECRET || !supabase) {
    return NextResponse.json({ error: "Video ads are not available yet." }, { status: 503 });
  }
  const limit = rateLimit(`ads:start:${user.id}`, 6, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count } = await supabase.from("ad_views").select("id", { count: "exact", head: true })
    .eq("user_id", user.id).gte("started_at", since);
  if ((count ?? 0) >= DAILY_VIEWS) {
    return NextResponse.json({ error: "That's all the ads for today. Come back tomorrow." }, { status: 429 });
  }
  const { data, error } = await supabase.from("ad_views").insert({ user_id: user.id }).select("id").single();
  if (error || !data) return NextResponse.json({ error: "Could not start an ad." }, { status: 500 });
  return NextResponse.json({ viewId: data.id, apiKey: key });
}

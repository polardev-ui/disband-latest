import { NextResponse } from "next/server";
import { getRouteUser, getServiceSupabase } from "@/lib/supabase/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

/*
 Rewarded video ads.

 The page plays a VAST ad from REWARDED_AD_TAG_URL (any VAST-capable ad
 network). Payment never trusts the browser: this route opens a view and
 hands its id to the ad request; the network's server-side verification
 callback (../verify) is the only thing that pays, and only once per view.
*/

const DAILY_VIEWS = 15;

function adTag(): string | null {
  return process.env.REWARDED_AD_TAG_URL || null;
}

/** Whether ads are set up, so the wallet can show or hide the button. */
export async function GET() {
  return NextResponse.json({ ready: !!adTag() && !!process.env.REWARDED_AD_SECRET });
}

export async function POST(req: Request) {
  const user = await getRouteUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const tag = adTag();
  const supabase = getServiceSupabase();
  if (!tag || !process.env.REWARDED_AD_SECRET || !supabase) {
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

  const url = new URL(tag);
  // Networks echo custom parameters back in their verification callback.
  url.searchParams.set("cust_params", `view_id=${data.id}`);
  url.searchParams.set("correlator", String(Date.now()));
  return NextResponse.json({ viewId: data.id, adTagUrl: url.toString() });
}

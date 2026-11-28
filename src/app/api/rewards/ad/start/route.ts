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
/*
 Attempts that never became a paid view (no ad to show, an ad blocker, the
 player closed early) used to count towards DAILY_VIEWS too, so ten failed
 tries locked someone out of ads for a day without earning anything. Only
 paid views count towards the day's ads now; this looser ceiling on all
 attempts is what stops anyone hammering the ad network.
*/
const DAILY_ATTEMPTS = DAILY_VIEWS * 4;

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

  // The same day the wallet's daily cap counts in (wallet_apply: since
  // midnight UTC), so "all the ads for today" agrees with what was paid.
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [{ count: paid }, { count: attempts }] = await Promise.all([
    supabase.from("ad_views").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).gte("verified_at", today).gt("reward", 0),
    supabase.from("ad_views").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).gte("started_at", since),
  ]);
  if ((paid ?? 0) >= DAILY_VIEWS) {
    return NextResponse.json({ error: "That's all the ads for today. Come back tomorrow." }, { status: 429 });
  }
  if ((attempts ?? 0) >= DAILY_ATTEMPTS) {
    return NextResponse.json({ error: "Too many ad attempts today. Try again tomorrow." }, { status: 429 });
  }
  const { data, error } = await supabase.from("ad_views").insert({ user_id: user.id }).select("id").single();
  if (error || !data) return NextResponse.json({ error: "Could not start an ad." }, { status: 500 });
  return NextResponse.json({ viewId: data.id, apiKey: key });
}

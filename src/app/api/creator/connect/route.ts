import { NextResponse } from "next/server";
import { getRouteUser, getServiceSupabase } from "@/lib/supabase/server";
import { checkoutOrigin } from "@/lib/checkout-origin";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { PLATFORMS, authorizeUrl, platformConfigured, signState, type CreatorPlatform } from "@/lib/creator.server";
import { syncCreatorBadge } from "./badge";

/** Which platforms can be connected on this deployment. */
export async function GET() {
  return NextResponse.json({ platforms: Object.fromEntries(PLATFORMS.map((p) => [p, platformConfigured(p)])) });
}

/** Start connecting: returns the platform's sign-in URL. */
export async function POST(req: Request) {
  const user = await getRouteUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const limit = rateLimit(`creator:connect:${user.id}`, 10, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
  const { platform } = (await req.json().catch(() => ({}))) as { platform?: string };
  if (!PLATFORMS.includes(platform as CreatorPlatform)) return NextResponse.json({ error: "Unknown platform" }, { status: 400 });
  const p = platform as CreatorPlatform;
  if (!platformConfigured(p)) return NextResponse.json({ error: "That platform isn't available yet." }, { status: 503 });
  return NextResponse.json({ url: authorizeUrl(p, checkoutOrigin(req), signState(user.id, p)) });
}

/** Disconnect a platform and re-check the badge. */
export async function DELETE(req: Request) {
  const user = await getRouteUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const platform = new URL(req.url).searchParams.get("platform");
  const supabase = getServiceSupabase();
  if (!supabase || !PLATFORMS.includes(platform as CreatorPlatform)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  await supabase.from("creator_connections").delete().eq("user_id", user.id).eq("platform", platform);
  await syncCreatorBadge(supabase, user.id);
  return NextResponse.json({ ok: true });
}

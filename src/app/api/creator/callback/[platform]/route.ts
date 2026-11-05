import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { PLATFORMS, fetchAccount, platformConfigured, verifyState, type CreatorPlatform } from "@/lib/creator.server";
import { syncCreatorBadge } from "../../connect/badge";

/** The platform sends people back here after they approve the connection. */
export async function GET(req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const url = new URL(req.url);
  const back = (status: string, message?: string) => {
    const to = new URL("/app", url.origin);
    to.searchParams.set("creator", status);
    if (message) to.searchParams.set("message", message.slice(0, 160));
    return NextResponse.redirect(to);
  };
  if (!PLATFORMS.includes(platform as CreatorPlatform) || !platformConfigured(platform as CreatorPlatform)) return back("error", "That platform isn't available.");
  const p = platform as CreatorPlatform;
  if (url.searchParams.get("error")) return back("cancelled");
  const code = url.searchParams.get("code");
  const verified = verifyState(url.searchParams.get("state") ?? "", p);
  if (!code || !verified) return back("error", "That connection link expired. Try again.");
  const userId = verified.userId;
  const codeVerifier = verified.codeVerifier;
  const supabase = getServiceSupabase();
  if (!supabase) return back("error", "Connections are unavailable right now.");

  try {
    const account = await fetchAccount(p, code, url.origin, codeVerifier);
    const { data: other } = await supabase.from("creator_connections").select("user_id")
      .eq("platform", p).eq("account_id", account.accountId).neq("user_id", userId).maybeSingle();
    if (other) return back("error", "That account is already connected to another Disband account.");
    const { error } = await supabase.from("creator_connections").upsert({
      user_id: userId, platform: p, account_id: account.accountId, handle: account.handle,
      followers: account.followers, refreshed_at: new Date().toISOString(),
      verified_at: account.followers >= 2500 ? new Date().toISOString() : null,
    }, { onConflict: "user_id,platform" });
    if (error) throw new Error(error.message);
    const earned = await syncCreatorBadge(supabase, userId);
    return back(earned ? "verified" : "connected");
  } catch (err) {
    return back("error", err instanceof Error ? err.message : "Couldn't connect that account.");
  }
}

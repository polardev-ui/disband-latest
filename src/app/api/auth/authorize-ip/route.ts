import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getClientIp } from "@/lib/request-ip";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

/*
 Opens an "Authorise this IP address" link from the new-IP email (see
 ../ip-check). The address authorised is the one the sign-in came from, not
 whichever one opens the link: people often open the email on their phone.
 Each link works once and for 30 minutes.
*/
export async function POST(request: Request) {
  const limit = rateLimit(`authorize-ip:${getClientIp(request) || "unknown"}`, 10, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const body = (await request.json().catch(() => null)) as { token?: string } | null;
  const token = body?.token?.trim();
  if (!token || token.length > 200) {
    return NextResponse.json({ ok: false, error: "This link isn't valid." }, { status: 400 });
  }
  const service = getServiceSupabase();
  if (!service) return NextResponse.json({ ok: false, error: "Try again in a moment." }, { status: 503 });

  const tokenHash = createHash("sha256").update(token).digest("hex");
  // Claim it in one step, so the same link can't be used twice at once.
  const { data } = await service
    .from("login_ip_challenges")
    .update({ used_at: new Date().toISOString() })
    .eq("token_hash", tokenHash)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("user_id, ip_hash")
    .maybeSingle();
  const row = data as { user_id: string; ip_hash: string } | null;
  if (!row) {
    return NextResponse.json(
      { ok: false, error: "This link has expired or has already been used. Sign in again to get a new one." },
      { status: 410 },
    );
  }

  const { error } = await service
    .from("trusted_login_ips")
    .upsert({ user_id: row.user_id, ip_hash: row.ip_hash, last_used_at: new Date().toISOString() });
  if (error) return NextResponse.json({ ok: false, error: "Couldn't authorise it. Try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

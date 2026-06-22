import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getClientIp, hashIp } from "@/lib/request-ip";
import { isVpnOrProxy } from "@/lib/vpn-check";
import { usernameContainsBlockedWord, usernameFormatError } from "@/lib/username-policy";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const checkIp = getClientIp(request) || "unknown";
  const checkLimit = rateLimit(`signup-check:${checkIp}`, 15, 60_000);
  if (!checkLimit.allowed) return tooManyRequests(checkLimit.retryAfterSeconds);

  let body: { email?: string; username?: string };
  try {
    body = (await request.json()) as { email?: string; username?: string };
  } catch {
    return NextResponse.json({ allowed: false, error: "Invalid request." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  const username = body.username?.trim().toLowerCase() ?? "";
  const ip = getClientIp(request);
  const ipHash = ip ? hashIp(ip) : null;

  const service = getServiceSupabase();
  if (!service) {
    return NextResponse.json({ allowed: false, error: "Signup is unavailable." }, { status: 503 });
  }

  if (ipHash) {
    const { data: blocked } = await service.rpc("is_signup_ip_blocked", { p_ip_hash: ipHash });
    if (blocked) {
      return NextResponse.json({
        allowed: false,
        blocked: true,
        error: "Account creation is temporarily blocked from your network. Try again in 24 hours.",
      }, { status: 403 });
    }
  }

  if (email) {
    const { data: bannedEmail } = await service
      .from("platform_bans")
      .select("user_id")
      .ilike("email", email)
      .maybeSingle();
    if (bannedEmail) {
      return NextResponse.json({
        allowed: false,
        error: "This email cannot create an account while a platform ban is active.",
      }, { status: 403 });
    }
  }

  const formatErr = usernameFormatError(username);
  if (formatErr) {
    if (usernameContainsBlockedWord(username) && ipHash) {
      await service.rpc("record_signup_ip_block", {
        p_ip_hash: ipHash,
        p_hours: 24,
        p_reason: "prohibited username",
      });
      return NextResponse.json({
        allowed: false,
        blocked: true,
        error: "That username is not allowed. Account creation from your network is blocked for 24 hours.",
      }, { status: 403 });
    }
    return NextResponse.json({ allowed: false, error: formatErr }, { status: 400 });
  }

  if (process.env.BLOCK_VPN_SIGNUP === "true" && ip) {
    const vpn = await isVpnOrProxy(ip);
    if (vpn) {
      return NextResponse.json({
        allowed: false,
        error: "Sign up from VPN or proxy connections is not allowed.",
      }, { status: 403 });
    }
  }

  return NextResponse.json({ allowed: true });
}

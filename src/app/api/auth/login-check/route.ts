import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getClientIp, hashIp, hashValue } from "@/lib/request-ip";
import { checkVpnStrict } from "@/lib/vpn-check";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { persistentRateLimitCheck, logGateEvent } from "@/lib/auth-guard";

// Agreed limits: 5/min + 20/hr per IP and per email.
const MIN_MAX = 5;
const HOUR_MAX = 20;

export async function POST(request: Request) {
  const ip = getClientIp(request) || "unknown";

  let body: { email?: string };
  try {
    body = (await request.json()) as { email?: string };
  } catch {
    return NextResponse.json({ allowed: false, error: "Invalid request." }, { status: 400 });
  }
  const email = body.email?.trim().toLowerCase() ?? "";
  if (!email || !email.includes("@")) {
    return NextResponse.json({ allowed: false, error: "Enter your email address." }, { status: 400 });
  }

  // Layer 1: in-memory burst guard (per isolate).
  const burst = rateLimit(`login-check:${ip}`, MIN_MAX, 60_000);
  if (!burst.allowed) return tooManyRequests(burst.retryAfterSeconds);

  const service = getServiceSupabase();

  // Layer 2: persistent limits (multi-instance safe on Cloudflare).
  const ipHash = ip !== "unknown" ? hashIp(ip) : "unknown";
  const emailHash = hashValue(email, "login-email");
  const hit = await persistentRateLimitCheck(service,
    ip === "unknown"
      ? [
          { key: `login:email:${emailHash}:min`, max: MIN_MAX, windowSeconds: 60 },
          { key: `login:email:${emailHash}:hr`, max: HOUR_MAX, windowSeconds: 3600 },
        ]
      : [
          { key: `login:ip:${ipHash}:min`, max: MIN_MAX, windowSeconds: 60 },
          { key: `login:ip:${ipHash}:hr`, max: HOUR_MAX, windowSeconds: 3600 },
          { key: `login:email:${emailHash}:min`, max: MIN_MAX, windowSeconds: 60 },
          { key: `login:email:${emailHash}:hr`, max: HOUR_MAX, windowSeconds: 3600 },
        ],
  );
  if (hit) {
    await logGateEvent(service, "login_rate_limited", ipHash === "unknown" ? null : ipHash, emailHash);
    return NextResponse.json(
      { allowed: false, error: "Too many sign-in attempts. Try again later." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  // Platform ban on this email: block login early with a generic message.
  if (service) {
    const { data: banned } = await service
      .from("platform_bans")
      .select("user_id")
      .ilike("email", email)
      .maybeSingle();
    if (banned) {
      await logGateEvent(service, "login_banned", ipHash === "unknown" ? null : ipHash, emailHash);
      return NextResponse.json(
        { allowed: false, error: "This account cannot sign in right now." },
        { status: 403 },
      );
    }
  }

  // VPN/proxy block — login only. Existing sessions are never re-checked,
  // so already-signed-in users stay signed in. Fail-closed per policy:
  // if detection is unavailable, block with a distinct code.
  if (process.env.BLOCK_VPN_LOGIN !== "false" && ip !== "unknown") {
    const vpn = await checkVpnStrict(ip);
    if (vpn.blocked) {
      await logGateEvent(service, "login_vpn_blocked", ipHash === "unknown" ? null : ipHash, emailHash);
      return NextResponse.json(
        {
          allowed: false,
          code: vpn.unavailable ? "VPN_DETECTION_UNAVAILABLE" : "VPN_BLOCKED",
          error: vpn.unavailable
            ? "Sign-in is temporarily unavailable from your network. Try again shortly."
            : "Signing in from a VPN or proxy is not allowed.",
        },
        { status: 403 },
      );
    }
  }

  await logGateEvent(service, "login_allowed", ipHash === "unknown" ? null : ipHash, emailHash);
  return NextResponse.json({ allowed: true });
}

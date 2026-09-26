import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getClientIp, hashIp, hashValue } from "@/lib/request-ip";
import { checkVpnStrict } from "@/lib/vpn-check";
import { usernameContainsBlockedWord, usernameFormatError } from "@/lib/username-policy";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { persistentRateLimitCheck, logGateEvent } from "@/lib/auth-guard";
import { verifyTurnstileToken } from "@/lib/turnstile";

// Agreed limits: 3/hr + 5/day per IP, 3/hr per email, plus existing 15/min burst guard.
export async function POST(request: Request) {
  const checkIp = getClientIp(request) || "unknown";
  const checkLimit = rateLimit(`signup-check:${checkIp}`, 15, 60_000);
  if (!checkLimit.allowed) return tooManyRequests(checkLimit.retryAfterSeconds);

  let body: { email?: string; username?: string; turnstileToken?: string };
  try {
    body = (await request.json()) as { email?: string; username?: string; turnstileToken?: string };
  } catch {
    return NextResponse.json({ allowed: false, error: "Invalid request." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  const username = body.username?.trim().toLowerCase() ?? "";

  const sanitized = username.replace(/[^a-z0-9_]/g, "");
  const ip = getClientIp(request);
  const ipHash = ip ? hashIp(ip) : null;

  const service = getServiceSupabase();
  if (!service) {
    return NextResponse.json({ allowed: false, error: "Signup is unavailable." }, { status: 503 });
  }

  // Persistent account-creation limits (multi-instance safe).
  const emailHash = email ? hashValue(email, "signup-email") : null;
  const persistentHit = await persistentRateLimitCheck(service,
    checkIp === "unknown"
      ? emailHash
        ? [
            { key: `signup:email:${emailHash}:hr`, max: 6, windowSeconds: 3600 },
            { key: `signup:email:${emailHash}:day`, max: 12, windowSeconds: 86400 },
          ]
        : []
      : [
          { key: `signup:ip:${ipHash}:hr`, max: 6, windowSeconds: 3600 },
          { key: `signup:ip:${ipHash}:day`, max: 12, windowSeconds: 86400 },
          ...(emailHash
            ? [
                { key: `signup:email:${emailHash}:hr`, max: 6, windowSeconds: 3600 },
                { key: `signup:email:${emailHash}:day`, max: 12, windowSeconds: 86400 },
              ]
            : []),
        ],
  );
  if (persistentHit) {
    await logGateEvent(service, "signup_rate_limited", ipHash, emailHash);
    return NextResponse.json(
      { allowed: false, error: "Too many accounts created from your network. Try again later." },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }

  // Optional Turnstile: verified when a token is supplied and a secret is
  // configured. Not yet mandatory so Tauri builds without the widget keep working.
  if (body.turnstileToken && process.env.TURNSTILE_SECRET_KEY) {
    const ok = await verifyTurnstileToken(body.turnstileToken, checkIp === "unknown" ? undefined : checkIp);
    if (!ok) {
      return NextResponse.json({ allowed: false, error: "Verification failed. Try again." }, { status: 403 });
    }
  }

  if (ipHash) {
    const { data: blocked } = await service.rpc("is_signup_ip_blocked", { p_ip_hash: ipHash });
    if (blocked) {
      return NextResponse.json({
        allowed: false,
        blocked: true,
        error: "Account creation is temporarily blocked from your network. Try again in 6 hours.",
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

  if (email) {

    const { data: emailCheck } = await service.rpc("check_email_allowed", {
      p_email: email,
    });
    if (emailCheck && emailCheck.allowed === false) {
      return NextResponse.json({
        allowed: false,
        error: (emailCheck.error as string | undefined) ?? "That email cannot be used.",
      }, { status: 400 });
    }
  }

  const formatErr = usernameFormatError(sanitized);
  if (formatErr) {
    // Patch 4 (fail-soft): a single bad username no longer burns the whole
    // network for 24h (griefable on schools/shared IPs, and responsible for
    // 89 blocks across 86 IPs). Every offense records an immediately-expired
    // strike row (blocks nothing — is_signup_ip_blocked only honors
    // blocked_until > now()); the real 6h block lands on the 4th+ offense
    // from the same network in 24h.
    if (usernameContainsBlockedWord(sanitized) && ipHash) {
      await service.rpc("record_signup_ip_block", {
        p_ip_hash: ipHash,
        p_hours: 0,
        p_reason: "prohibited username (strike)",
      });
      const { count: recentStrikes } = await service
        .from("signup_ip_blocks")
        .select("ip_hash", { count: "exact", head: true })
        .eq("ip_hash", ipHash)
        .gt("blocked_until", new Date(Date.now() - 24 * 3600_000).toISOString());
      if ((recentStrikes ?? 0) >= 4) {
        await service.rpc("record_signup_ip_block", {
          p_ip_hash: ipHash,
          p_hours: 6,
          p_reason: "prohibited username",
        });
        return NextResponse.json({
          allowed: false,
          blocked: true,
          error: "That username is not allowed. Account creation from your network is blocked for 6 hours.",
        }, { status: 403 });
      }
      return NextResponse.json({ allowed: false, error: formatErr }, { status: 400 });
    }
    return NextResponse.json({ allowed: false, error: formatErr }, { status: 400 });
  }

  const { data: availability } = await service.rpc("check_username_available", {
    p_username: sanitized,
  });
  if (availability && availability.available === false) {
    return NextResponse.json({
      allowed: false,
      error: (availability.reason as string | undefined) ?? "That username is not available.",
    }, { status: 400 });
  }

  // VPN/proxy block is always on for signup — signup is the account-farming
  // surface, so this gate matters most.
  //
  // FAIL-OPEN on detection unavailability, deliberately. `unavailable` means
  // "no provider could tell us", which is not evidence of a VPN. The free IPQS
  // tier caps at ~35 lookups/day, so quota exhaustion is an expected daily
  // condition, not an attack — rejecting on it would convert a third-party
  // billing limit into a total signup outage. Local/private IPs bypass inside
  // checkVpnStrict. Only a confirmed two-provider block rejects.
  if (process.env.BLOCK_VPN_SIGNUP !== "false" && checkIp !== "unknown") {
    const vpn = await checkVpnStrict(checkIp);
    if (vpn.blocked) {
      await logGateEvent(service, "signup_vpn_blocked", ipHash, emailHash);
      return NextResponse.json({
        allowed: false,
        code: "VPN_BLOCKED",
        error: "Sign up from VPN or proxy connections is not allowed.",
      }, { status: 403 });
    }
    if (vpn.unavailable) {
      // Logged, not enforced — see the fail-open note above.
      await logGateEvent(service, "signup_vpn_detection_unavailable", ipHash, emailHash);
    }
  }

  return NextResponse.json({ allowed: true });
}

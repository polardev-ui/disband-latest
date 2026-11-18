import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getClientIp, hashIp, hashValue } from "@/lib/request-ip";
import { checkVpnStrict } from "@/lib/vpn-check";
import { rateLimit } from "@/lib/rate-limit";
import { persistentRateLimitCheck, logGateEvent } from "@/lib/auth-guard";
import { isLoginAllowlisted } from "@/lib/login-allowlist";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { activeRestriction, restrictedResponse, withRestriction } from "@/lib/network-restriction.server";

// Agreed limits: 5/min + 20/hr per IP and per email.
const MIN_MAX = 5;
const HOUR_MAX = 20;

export async function POST(request: Request) {
  const ip = getClientIp(request) || "unknown";

  let body: { email?: string; turnstileToken?: string; nr?: string };
  try {
    body = (await request.json()) as { email?: string; turnstileToken?: string; nr?: string };
  } catch {
    return NextResponse.json({ allowed: false, error: "Invalid request." }, { status: 400 });
  }
  const email = body.email?.trim().toLowerCase() ?? "";
  if (!email || !email.includes("@")) {
    return NextResponse.json({ allowed: false, error: "Enter your email address." }, { status: 400 });
  }

  // Apple's App Review account skips the friction layers below — see
  // `login-allowlist.ts` for why. It still passes through the platform-ban
  // check and is still logged.
  const allowlisted = isLoginAllowlisted(email);

  // A device still restricted from an earlier refusal stays refused until
  // the time runs out, whatever network it's on now.
  if (!allowlisted) {
    const held = activeRestriction(request, body.nr);
    if (held) return restrictedResponse(held);
  }

  // Layer 1: in-memory burst guard (per isolate).
  if (!allowlisted) {
    const burst = rateLimit(`login-check:${ip}`, MIN_MAX, 60_000);
    if (!burst.allowed) {
      return withRestriction(
        { allowed: false, error: "Too many sign-in attempts. Try again later." },
        429, "rate_limited", Math.max(60, burst.retryAfterSeconds),
        { "Retry-After": String(burst.retryAfterSeconds) },
      );
    }
  }

  const service = getServiceSupabase();

  // Layer 2: persistent limits (multi-instance safe on Cloudflare).
  const ipHash = ip !== "unknown" ? hashIp(ip) : "unknown";
  const emailHash = hashValue(email, "login-email");
  if (!allowlisted) {
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
      // Held on the device for the same 60 seconds this refusal has always
      // given (its Retry-After), so a fresh VPN address doesn't start the
      // count again.
      return withRestriction(
        { allowed: false, error: "Too many sign-in attempts. Try again later." },
        429, "rate_limited", 60, { "Retry-After": "60" },
      );
    }
  }

  // Platform ban on this email: block login early with a generic message.
  if (service) {
    const { data: acct } = await service
      .from("account_emails")
      .select("user_id")
      .eq("canonical", email.trim().toLowerCase())
      .maybeSingle();
    if (acct?.user_id) {
      const { data: banned } = await service
        .from("platform_bans")
        .select("user_id")
        .eq("user_id", acct.user_id)
        .maybeSingle();
      if (banned) {
        await logGateEvent(service, "login_banned", ipHash === "unknown" ? null : ipHash, emailHash);
        return NextResponse.json(
          { allowed: false, error: "This account cannot sign in right now." },
          { status: 403 },
        );
      }
    }
  }

  // VPN/proxy block — login only. Existing sessions are never re-checked, so
  // already-signed-in users stay signed in. Allowlisted addresses skip it.
  //
  // NARROW ON PURPOSE (see `vpn-check.ts`): a hard block is reserved for a
  // categorically-confirmed TOR exit. Everything that merely *looks* anonymised
  // — iCloud Private Relay (default-on for iCloud+ in Safari, and scored "high
  // risk" by IPQS AND flagged `hosting` by ip-api, so even a two-provider
  // consensus convicts it), carrier/CGNAT pools, shared campus/corporate NAT,
  // and ordinary privacy VPNs — gets a Cloudflare Turnstile step-up instead of
  // a refusal. A human passes; bots don't.
  //
  // FAIL-OPEN, deliberately. `unavailable` means "we could not tell", which is
  // NOT a verdict and must never be one: the free IPQS tier caps fast, so a
  // quota-outage is an *expected* condition here, not an emergency. An
  // inconclusive check is logged and let through.
  if (!allowlisted && process.env.BLOCK_VPN_LOGIN !== "false" && ip !== "unknown") {
    const vpn = await checkVpnStrict(ip);
    if (vpn.blocked) {
      await logGateEvent(service, "login_vpn_blocked", ipHash === "unknown" ? null : ipHash, emailHash);
      return withRestriction(
        {
          allowed: false,
          code: "VPN_BLOCKED",
          error: "Signing in from a VPN or proxy is not allowed.",
        },
        // As long as the existing network block lasts (6 hours).
        403, "network_blocked", 6 * 3600,
      );
    }
    if (vpn.flagged) {
      // Flagged networks used to be the only ones asked for the check; now
      // everyone is (below). Logged so the volume stays visible.
      await logGateEvent(service, "login_vpn_challenge_required", ipHash === "unknown" ? null : ipHash, emailHash);
    }
    if (vpn.unavailable) {
      // Loud but harmless: this is how we notice if provider health degrades.
      await logGateEvent(service, "login_vpn_detection_unavailable", ipHash === "unknown" ? null : ipHash, emailHash);
    }
  }

  // Cloudflare Turnstile on every sign-in, on every platform (the apps show
  // it when this answers TURNSTILE_REQUIRED). Only App Review's account is
  // exempt, and a server with no secret configured (local development).
  if (!allowlisted && process.env.TURNSTILE_SECRET_KEY) {
    if (!body.turnstileToken) {
      return NextResponse.json(
        {
          allowed: false,
          code: "TURNSTILE_REQUIRED",
          challengeRequired: true,
          error: "Please complete the verification to continue.",
        },
        { status: 403 },
      );
    }
    const verified = await verifyTurnstileToken(body.turnstileToken, ip === "unknown" ? undefined : ip);
    if (!verified) {
      await logGateEvent(service, "login_vpn_challenge_failed", ipHash === "unknown" ? null : ipHash, emailHash);
      return NextResponse.json(
        {
          allowed: false,
          code: "TURNSTILE_INVALID",
          challengeRequired: true,
          error: "That verification didn't work. Please try the check again.",
        },
        { status: 403 },
      );
    }
  }

  await logGateEvent(service, "login_allowed", ipHash === "unknown" ? null : ipHash, emailHash);
  return NextResponse.json({ allowed: true });
}

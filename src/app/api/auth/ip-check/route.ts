import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getClientIp, hashIp, hashValue } from "@/lib/request-ip";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { persistentRateLimitCheck } from "@/lib/auth-guard";
import { isLoginAllowlisted } from "@/lib/login-allowlist";
import { sendResendEmail } from "@/lib/resend";
import { PUBLIC_ENV } from "@/lib/public-env";

/*
 New-IP sign-in check, run by the sign-in screen just before it signs in.

 With the right password from an IP address the account hasn't used before,
 this answers NEW_IP and emails the owner an "Authorise this IP address"
 link instead of letting the sign-in go ahead. Once that link is opened
 (/authorize-ip), signing in from that address works.

 A wrong password answers ok and sends nothing: the sign-in that follows
 fails with the usual message, so this can't be used to learn whether a
 password is right, or to fill someone's inbox without their password.

 Addresses are already known when they're authorised, or when one of the
 account's current sessions is on them, so devices people use today keep
 working. An account with no record anywhere trusts its first address.
*/

const CHALLENGE_MINUTES = 30;
const EMAILS_PER_15_MIN = 3;

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const burst = rateLimit(`ip-check:${ip || "unknown"}`, 10, 60_000);
  if (!burst.allowed) return tooManyRequests(burst.retryAfterSeconds);

  let body: { email?: string; password?: string };
  try {
    body = (await request.json()) as { email?: string; password?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  if (!email || !password) return NextResponse.json({ ok: true });

  const service = getServiceSupabase();
  // Can't tell where someone is, or can't check: don't stand in the way.
  if (!service || !ip || isLoginAllowlisted(email)) return NextResponse.json({ ok: true });

  const ipHash = hashIp(ip);
  const limited = await persistentRateLimitCheck(service, [
    { key: `ipcheck:ip:${ipHash}:hr`, max: 30, windowSeconds: 3600 },
    { key: `ipcheck:email:${hashValue(email, "login-email")}:hr`, max: 30, windowSeconds: 3600 },
  ]);
  if (limited) {
    return NextResponse.json({ ok: false, error: "Too many sign-in attempts. Try again later." }, { status: 429 });
  }

  const { data: userId, error: pwError } = await service.rpc("verify_login_password", {
    p_email: email,
    p_password: password,
  });
  // Wrong password (or the check isn't installed yet): the sign-in itself
  // says so.
  if (pwError || !userId) return NextResponse.json({ ok: true });

  const { data: status, error: statusError } = await service.rpc("login_ip_status", {
    p_user_id: userId,
    p_ip_hash: ipHash,
    p_ip: ip,
  });
  if (statusError) return NextResponse.json({ ok: true });

  if (status === "trusted" || status === "first") {
    await service
      .from("trusted_login_ips")
      .upsert({ user_id: userId, ip_hash: ipHash, last_used_at: new Date().toISOString() });
    return NextResponse.json({ ok: true });
  }

  // Somewhere new. Email a link, unless several went out just now.
  const since = new Date(Date.now() - 15 * 60_000).toISOString();
  const { count } = await service
    .from("login_ip_challenges")
    .select("token_hash", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);

  if ((count ?? 0) < EMAILS_PER_15_MIN) {
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const { error: insertError } = await service.from("login_ip_challenges").insert({
      token_hash: tokenHash,
      user_id: userId,
      ip_hash: ipHash,
      expires_at: new Date(Date.now() + CHALLENGE_MINUTES * 60_000).toISOString(),
    });
    if (!insertError) {
      try {
        await sendResendEmail({
          to: email,
          subject: "Authorise a Disband sign-in from a new IP address",
          html: newIpEmail(token, ip, locationOf(request)),
        });
      } catch {
        // The email couldn't go: let them in rather than lock them out.
        await service.from("login_ip_challenges").delete().eq("token_hash", tokenHash);
        return NextResponse.json({ ok: true });
      }
    }
  }

  return NextResponse.json(
    {
      ok: false,
      code: "NEW_IP",
      error:
        "You're signing in from a new IP address. We've emailed you a link to authorise it. Open it, then sign in again.",
    },
    { status: 403 },
  );
}

/** "Seattle, Washington, United States", from Cloudflare's or Vercel's headers when present. */
function locationOf(request: Request): string | null {
  const h = request.headers;
  const decode = (v: string | null) => {
    if (!v) return null;
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  };
  const city = decode(h.get("cf-ipcity") ?? h.get("x-vercel-ip-city"));
  const region = decode(h.get("cf-region") ?? h.get("x-vercel-ip-country-region"));
  const countryCode = h.get("cf-ipcountry") ?? h.get("x-vercel-ip-country");
  let country: string | null = null;
  if (countryCode && /^[A-Z]{2}$/.test(countryCode)) {
    try {
      country = new Intl.DisplayNames(["en-GB"], { type: "region" }).of(countryCode) ?? countryCode;
    } catch {
      country = countryCode;
    }
  }
  const parts = [city, region, country].filter((p): p is string => !!p);
  return parts.length ? parts.join(", ") : null;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function newIpEmail(token: string, ip: string, location: string | null): string {
  const link = `${PUBLIC_ENV.webAppUrl.replace(/\/$/, "")}/authorize-ip#token=${token}`;
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;max-width:560px">
    <h2 style="margin:0 0 16px">Someone tried to sign in to your Disband account from a new IP address.</h2>
    <p style="margin:0 0 4px"><span style="color:#666">IP address:</span> ${escapeHtml(ip)}</p>
    ${location ? `<p style="margin:0 0 16px"><span style="color:#666">Location:</span> ${escapeHtml(location)}</p>` : `<div style="height:12px"></div>`}
    <p style="margin:0 0 20px">If it was you, authorise this IP address, then sign in again.</p>
    <p style="margin:0 0 12px">
      <a href="${link}" style="display:inline-block;background:#5865f2;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600">
        Authorise this IP address
      </a>
    </p>
    <p style="margin:0 0 20px;color:#666">This link expires in ${CHALLENGE_MINUTES} minutes.</p>
    <p style="margin:0 0 20px;color:#666">If it wasn't you, someone knows your password: change it now in Settings → My Account.</p>
    <p style="margin:0">The Disband team</p>
  </div>`;
}

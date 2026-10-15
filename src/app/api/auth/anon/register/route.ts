import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getClientIp } from "@/lib/request-ip";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { formatAccountNumber, isAnonTier } from "@/lib/anon-accounts";
import {
  expiryForTier,
  generateAccountNumber,
  generateAnonEmail,
  hashAccountNumber,
  mintSessionForEmail,
} from "@/lib/anon-accounts.server";

export const dynamic = "force-dynamic";

/**
 * Create a throwaway anonymous account.
 *
 * The client sends the chosen tier and a Turnstile token. We mint a real
 * Supabase user with a random @disband.dev email, register the 16-digit number
 * (only its hash is stored), tag the profile as anonymous, and hand back a
 * session so the caller drops straight into the app. The number is returned
 * exactly once and is the only way back in.
 *
 * No IP address is persisted: the burst guard below is the in-process rate
 * limiter, and the Turnstile check is not given a remote IP.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request) || "unknown";
  const limit = rateLimit(`anon-register:${ip}`, 5, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  let body: { tier?: string; turnstileToken?: string };
  try {
    body = (await request.json()) as { tier?: string; turnstileToken?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (process.env.TURNSTILE_SECRET_KEY && (!body.turnstileToken || !(await verifyTurnstileToken(body.turnstileToken)))) {
    return NextResponse.json(
      { error: "Please complete the verification challenge.", code: "TURNSTILE_REQUIRED" },
      { status: 403 },
    );
  }

  if (!isAnonTier(body.tier)) {
    return NextResponse.json({ error: "Choose how long the account should last." }, { status: 400 });
  }
  const tier = body.tier;

  const service = getServiceSupabase();
  if (!service) {
    return NextResponse.json({ error: "Anonymous accounts are unavailable right now." }, { status: 503 });
  }

  const number = generateAccountNumber();
  const email = generateAnonEmail();
  const username = `anon_${randomBytes(6).toString("hex")}`;
  const { expiresAt, purgeAfter } = expiryForTier(tier);

  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    // A random password nobody ever needs: sessions are minted with a one-time
    // magic link, so there is no password to leak or reset.
    password: randomBytes(24).toString("base64url"),
    email_confirm: true,
    user_metadata: { anonymous: "true", username, display_name: "Anonymous" },
  });
  if (createError || !created?.user) {
    return NextResponse.json({ error: "Could not create the account. Try again." }, { status: 500 });
  }
  const userId = created.user.id;

  try {
    const { error: insertError } = await service.from("anonymous_accounts").insert({
      user_id: userId,
      number_hash: hashAccountNumber(number),
      tier,
      expires_at: expiresAt.toISOString(),
      purge_after: purgeAfter.toISOString(),
    });
    if (insertError) throw insertError;

    // The signup trigger creates the profile; tag it anonymous, and create it
    // ourselves in the unlikely event the trigger was skipped.
    const { data: tagged } = await service
      .from("profiles")
      .update({ account_type: "anonymous" })
      .eq("id", userId)
      .select("id")
      .maybeSingle();
    if (!tagged) {
      await service.from("profiles").insert({
        id: userId,
        username,
        display_name: "Anonymous",
        account_type: "anonymous",
      });
    }

    const session = await mintSessionForEmail(email);

    return NextResponse.json({
      ok: true,
      number: formatAccountNumber(number),
      tier,
      expiresAt: expiresAt.toISOString(),
      purgeAfter: purgeAfter.toISOString(),
      ...(session ? { session } : {}),
    });
  } catch (err) {
    console.error("[anon/register] failed", err);
    await service.auth.admin.deleteUser(userId).catch(() => {});
    return NextResponse.json({ error: "Could not create the account. Try again." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getClientIp } from "@/lib/request-ip";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { isValidAccountNumber, normalizeAccountNumber, type AnonExpiredInfo } from "@/lib/anon-accounts";
import { findAnonByNumber, mintSessionForEmail, processExpiredAnonAccount } from "@/lib/anon-accounts.server";

export const dynamic = "force-dynamic";

/**
 * Sign in with a 16-digit anonymous account number.
 *
 * Three outcomes:
 *   ok       → a session (set client-side with supabase.auth.setSession)
 *   expired  → the account is past its lifetime. If the 30-day download window
 *              is still open the screen offers an export; otherwise it reports
 *              the data as purged.
 *   error    → unknown number (deliberately generic).
 *
 * Verified anonymously: no IP is stored, and the Turnstile check is not given a
 * remote IP.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request) || "unknown";
  const limit = rateLimit(`anon-login:${ip}`, 10, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  let body: { number?: string; turnstileToken?: string };
  try {
    body = (await request.json()) as { number?: string; turnstileToken?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (process.env.TURNSTILE_SECRET_KEY && (!body.turnstileToken || !(await verifyTurnstileToken(body.turnstileToken)))) {
    return NextResponse.json(
      { error: "Please complete the verification challenge.", code: "TURNSTILE_REQUIRED" },
      { status: 403 },
    );
  }

  if (!body.number || !isValidAccountNumber(body.number)) {
    return NextResponse.json({ error: "Enter your 16-digit account number." }, { status: 400 });
  }

  const service = getServiceSupabase();
  if (!service) {
    return NextResponse.json({ error: "Anonymous accounts are unavailable right now." }, { status: 503 });
  }

  const record = await findAnonByNumber(normalizeAccountNumber(body.number));
  if (!record) {
    return NextResponse.json(
      { error: "That account number wasn't found. Check it and try again." },
      { status: 401 },
    );
  }

  const now = Date.now();
  const expired = Date.parse(record.expires_at) <= now;
  const purged = record.data_purged_at != null;
  const withinWindow = Date.parse(record.purge_after) > now;

  if (purged || expired) {
    // Wipe the live account on the spot if the sweep hasn't caught it yet, so
    // "expired" genuinely means gone — not merely locked out.
    if (expired && !purged && !record.expires_processed_at) {
      await processExpiredAnonAccount(record);
    }
    const payload: AnonExpiredInfo = {
      status: "expired",
      canDownload: !purged && withinWindow,
      purged,
      expiresAt: record.expires_at,
      purgeAfter: record.purge_after,
    };
    return NextResponse.json(payload, { status: 200 });
  }

  if (!record.user_id) {
    // Shouldn't happen while active, but never hand back an empty session.
    return NextResponse.json({ error: "That account number wasn't found." }, { status: 401 });
  }

  const { data: userData } = await service.auth.admin.getUserById(record.user_id);
  const email = userData?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "That account could not be opened." }, { status: 500 });
  }

  const session = await mintSessionForEmail(email);
  if (!session) {
    return NextResponse.json({ error: "Could not sign in. Try again." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    session,
    expiresAt: record.expires_at,
    purgeAfter: record.purge_after,
  });
}

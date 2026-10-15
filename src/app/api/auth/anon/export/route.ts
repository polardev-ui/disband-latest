import { NextResponse } from "next/server";
import { getClientIp } from "@/lib/request-ip";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { isValidAccountNumber, normalizeAccountNumber } from "@/lib/anon-accounts";
import { findAnonByNumber, getAnonSnapshot, processExpiredAnonAccount } from "@/lib/anon-accounts.server";

export const dynamic = "force-dynamic";

/**
 * Download the private JSON snapshot of an expired anonymous account, available
 * for the 30-day window between `expires_at` and `purge_after`.
 *
 * The live account was already wiped at expiry; this only serves the retained
 * copy. The number itself authorises the export (the account can no longer sign
 * in), so the endpoint is Turnstile-gated and rate limited.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request) || "unknown";
  const limit = rateLimit(`anon-export:${ip}`, 6, 60_000);
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

  const digits = normalizeAccountNumber(body.number);
  const record = await findAnonByNumber(digits);
  if (!record) {
    return NextResponse.json(
      { error: "That account number wasn't found. Check it and try again." },
      { status: 401 },
    );
  }
  if (record.data_purged_at != null) {
    return NextResponse.json({ error: "There is no data left to export for that account." }, { status: 404 });
  }

  const now = Date.now();
  if (Date.parse(record.expires_at) > now) {
    return NextResponse.json(
      { error: "This account hasn't expired yet. Your export opens once it does." },
      { status: 400 },
    );
  }
  if (Date.parse(record.purge_after) <= now) {
    return NextResponse.json({ error: "The download window for this account has closed." }, { status: 410 });
  }

  // Expiry is normally handled by the sweep; process lazily if this account
  // expired between sweeps so the export is always available immediately.
  if (!record.expires_processed_at) {
    await processExpiredAnonAccount(record);
  }

  const snapshot = await getAnonSnapshot(record.id);
  if (!snapshot) {
    return NextResponse.json({ error: "There is no data left to export for that account." }, { status: 404 });
  }

  const filename = `disband-anonymous-export-${digits.slice(-4)}.json`;
  return new NextResponse(JSON.stringify(snapshot, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

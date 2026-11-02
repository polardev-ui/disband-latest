import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { runPaymentRetries } from "@/lib/billing-retry.server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily failed-payment sweep: retry each past-due Aero/Lite invoice once,
 * and cancel subscriptions that have been failing for 14 days. See
 * runPaymentRetries.
 *
 * Gated on a shared secret like /api/cron/anon-purge. Accepts
 * BILLING_RETRY_CRON_SECRET, or the raffle secret so the pg_cron job can
 * reuse the raffle cron's vault key with no new setup.
 */
function secretMatches(provided: string | null): boolean {
  if (!provided) return false;
  const expected = [process.env.BILLING_RETRY_CRON_SECRET, process.env.RAFFLE_CRON_SECRET]
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s));
  if (expected.length === 0) return false;

  const providedHash = createHash("sha256").update(provided).digest();
  return expected.some((secret) =>
    timingSafeEqual(providedHash, createHash("sha256").update(secret).digest()),
  );
}

async function run(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!secretMatches(provided)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limit = rateLimit(`billing-retry-cron:ip:${ip}`, 10, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  try {
    const outcome = await runPaymentRetries();
    return NextResponse.json({ ok: true, ...outcome });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return run(request);
}

export async function GET(request: Request) {
  return run(request);
}

import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { expireDueAnonymousAccounts, purgeDueAnonymousAccounts } from "@/lib/anon-accounts.server";

export const dynamic = "force-dynamic";

/**
 * Scheduled sweep, in two passes:
 *   expire — snapshot accounts whose lifetime ended and delete their live data
 *            immediately (so an expired account is genuinely gone, not just
 *            locked out);
 *   purge  — delete the retained snapshot once the 30-day download window has
 *            closed.
 * Both are idempotent, so a retry after a partial failure is a no-op.
 *
 * Gated on a shared secret like /api/cron/raffle, because a database cron has
 * no session. Accepts ANON_PURGE_CRON_SECRET, or falls back to the raffle
 * secret so the sweep can reuse the raffle cron's vault key with no new setup.
 */
function secretMatches(provided: string | null): boolean {
  if (!provided) return false;
  const expected = [process.env.ANON_PURGE_CRON_SECRET, process.env.RAFFLE_CRON_SECRET]
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
  const limit = rateLimit(`anon-purge-cron:ip:${ip}`, 10, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  if (!getServiceSupabase()) {
    return NextResponse.json({ error: "Supabase service role is not configured." }, { status: 503 });
  }

  try {
    const exp = await expireDueAnonymousAccounts();
    const pur = await purgeDueAnonymousAccounts();
    return NextResponse.json({ ok: true, expired: exp, purged: pur });
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

import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { notifyDecidedReports } from "@/lib/report-notices";

export const dynamic = "force-dynamic";

/**
 * Every few minutes (pg_cron, migration 0233): tell reporters the outcome of
 * reports that Tether or staff have decided. Gated on the raffle cron's
 * shared secret, like the other database-driven sweeps.
 */
function secretMatches(provided: string | null): boolean {
  if (!provided) return false;
  const expected = [process.env.REPORT_OUTCOMES_CRON_SECRET, process.env.RAFFLE_CRON_SECRET]
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s));
  if (expected.length === 0) return false;
  const providedHash = createHash("sha256").update(provided).digest();
  return expected.some((secret) => timingSafeEqual(providedHash, createHash("sha256").update(secret).digest()));
}

export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  if (!secretMatches(auth.startsWith("Bearer ") ? auth.slice(7).trim() : null)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await notifyDecidedReports()) });
  } catch (err) {
    console.error("[cron/report-outcomes]", err);
    return NextResponse.json({ error: "Sweep failed." }, { status: 500 });
  }
}

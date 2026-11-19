import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runMarketplaceReview } from "@/lib/bot-marketplace.server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Once a day (pg_cron, migration 0275): Tether reviews marketplace bot
 * submissions and reported reviews. Gated on the raffle cron's
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
    return NextResponse.json({ ok: true, ...(await runMarketplaceReview()) });
  } catch (err) {
    console.error("[cron/bot-marketplace]", err);
    return NextResponse.json({ error: "Sweep failed." }, { status: 500 });
  }
}

import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  ensureActiveDraw,
  getDraw,
  getRaffleConfig,
  refreshDeliveryStatus,
  promoteRunnerUp,
  runDraw,
} from "@/lib/raffle";

export const dynamic = "force-dynamic";

/**
 * Scheduled endpoint for the giveaway.
 *
 * Two jobs, both safe to run on a tight schedule:
 *
 *   draw    — at the published draw moment, draws the winner, emails the winner
 *             and the owner. Idempotent: the draw record only moves out of
 *             `open` once, so a retry after a partial failure is a no-op
 *             rather than a second draw.
 *   upkeep — checks whether the winner's email actually landed and promotes the
 *             runner-up once the 7-day response window closes.
 *
 * Gated on a shared secret rather than a session, because a database cron job
 * has no session. The secret is compared in constant time, and an unset
 * secret fails closed — the endpoint is unreachable rather than open.
 */

type Job = "draw" | "upkeep";

function secretMatches(provided: string | null): boolean {
  const expected = process.env.RAFFLE_CRON_SECRET?.trim();
  if (!expected || !provided) return false;

  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  try {
    const auth = request.headers.get("authorization") ?? "";
    const provided = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;

    if (!secretMatches(provided)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const limit = rateLimit(`raffle-cron:ip:${ip}`, 20, 60_000);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

    if (!getServiceSupabase()) {
      return NextResponse.json({ error: "Supabase service role is not configured." }, { status: 503 });
    }

    let job: Job = "draw";
    const url = new URL(request.url);
    const fromQuery = url.searchParams.get("job");
    if (fromQuery) job = fromQuery as Job;
    if (request.headers.get("content-type")?.includes("application/json")) {
      try {
        const body = (await request.json()) as { job?: Job; force?: boolean };
        if (body.job) job = body.job;
      } catch {
        return NextResponse.json({ error: "Invalid request." }, { status: 400 });
      }
    }

    if (job !== "draw" && job !== "upkeep") {
      return NextResponse.json({ error: "Unknown job." }, { status: 400 });
    }

    if (job === "draw") {
      const draw = await ensureActiveDraw();
      if (draw.status !== "open") {
        return NextResponse.json({ ok: true, skipped: "already-drawn", draw });
      }

      const force = request.headers.get("x-raffle-force") === "1";
      const result = await runDraw({ force });
      return NextResponse.json({
        ok: true,
        winner: result.winner,
        runnerUp: result.runnerUp,
        winnerEmail: result.winnerEmail,
        ownerReport: result.ownerReport,
        draw: result.draw,
      });
    }

    // upkeep
    const draw = await ensureActiveDraw();
    if (draw.status === "open") {
      return NextResponse.json({ ok: true, skipped: "not-drawn-yet", draw });
    }

    const delivery = await refreshDeliveryStatus(draw.id);
    const promotion = await promoteRunnerUp(draw.id);
    return NextResponse.json({
      ok: true,
      delivery,
      promotion,
      draw: await getDraw(draw.id),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

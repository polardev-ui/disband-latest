import { NextResponse } from "next/server";
import {
  getUserFromRequest,
  requirePlatformOwner,
  verifyOwnerPassword,
} from "@/lib/server-auth";
import { getClientIp } from "@/lib/request-ip";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  ensureActiveDraw,
  getDraw,
  getPool,
  getStandings,
  refreshDeliveryStatus,
  recordClaim,
  resendWinnerEmail,
  runDraw,
  promoteRunnerUp,
  getRaffleConfig,
} from "@/lib/raffle";

export const dynamic = "force-dynamic";

/**
 * Owner-only control surface for the PlayStation 5 giveaway.
 *
 * GET  — current pool, the draw record, and the winner's real delivery status.
 * POST — run the draw, re-send a bounced email, promote the runner-up, or
 *        record that the winner replied.
 *
 * Reads need only owner auth. Anything that changes the draw additionally
 * requires the owner password, matching the platform-ban route: a stolen
 * session should be able to look at the raffle but not to run it.
 */

type Action =
  | "draw"
  | "delivery"
  | "resend"
  | "promote"
  | "claim"
  | "standings";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function requireOwner(request: Request) {
  const user = await getUserFromRequest(request as import("next/server").NextRequest);
  if (!user) return { ok: false as const, response: errorResponse("Not authenticated.", 401) };
  if (!(await requirePlatformOwner(user.id))) {
    return { ok: false as const, response: errorResponse("Insufficient permissions.", 403) };
  }
  return { ok: true as const, user };
}

export async function GET(request: Request) {
  try {
    const owner = await requireOwner(request);
    if (!owner.ok) return owner.response;

    const ip = getClientIp(request) || "unknown";
    const limit = rateLimit(`raffle:read:ip:${ip}`, 30, 60_000);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

    // `?action=delivery` is the "did it actually arrive?" check: it polls the
    // mail provider and records the outcome.
    const url = new URL(request.url);
    if (url.searchParams.get("action") === "delivery") {
      const draw = await ensureActiveDraw();
      const result = await refreshDeliveryStatus(draw.id);
      return NextResponse.json({ ...result, draw: await getDraw(draw.id) });
    }

    const draw = await ensureActiveDraw();
    const [standings, pool, config] = await Promise.all([
      getStandings(50),
      draw.status === "open" ? Promise.resolve([]) : getPool(draw.id),
      Promise.resolve(getRaffleConfig()),
    ]);

    return NextResponse.json({
      draw,
      config,
      standings,
      pool: pool.slice(0, 25),
      totals: {
        entrants: standings.length,
        tickets: standings.reduce((sum, row) => sum + row.entries, 0),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return errorResponse(message, 500);
  }
}

export async function POST(request: Request) {
  try {
    const owner = await requireOwner(request);
    if (!owner.ok) return owner.response;

    const ip = getClientIp(request) || "unknown";
    const ipLimit = rateLimit(`raffle:write:ip:${ip}`, 20, 60_000);
    if (!ipLimit.allowed) return tooManyRequests(ipLimit.retryAfterSeconds);
    const userLimit = rateLimit(`raffle:write:user:${owner.user.id}`, 20, 60_000);
    if (!userLimit.allowed) return tooManyRequests(userLimit.retryAfterSeconds);

    let body: { action?: Action; password?: string; drawId?: string; prizeChoice?: string; force?: boolean };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return errorResponse("Invalid request.", 400);
    }

    const action = body.action;
    if (!action || !["draw", "delivery", "resend", "promote", "claim", "standings"].includes(action)) {
      return errorResponse("Unknown action.", 400);
    }

    // Reading the pool changes nothing, so it does not need the password.
    if (action === "standings") {
      return NextResponse.json({ standings: await getStandings(200) });
    }

    if (!verifyOwnerPassword(body.password)) {
      return errorResponse("Invalid owner password.", 403);
    }

    switch (action) {
      case "draw": {
        const result = await runDraw({ force: body.force === true });
        return NextResponse.json({
          ok: true,
          winner: result.winner,
          runnerUp: result.runnerUp,
          winnerEmail: result.winnerEmail,
          draw: result.draw,
          ownerReport: result.ownerReport,
        });
      }

      case "delivery": {
        const draw = body.drawId ? await getDraw(body.drawId) : await ensureActiveDraw();
        if (!draw) return errorResponse("No such draw.", 404);
        return NextResponse.json(await refreshDeliveryStatus(draw.id));
      }

      case "resend": {
        const draw = body.drawId ? await getDraw(body.drawId) : await ensureActiveDraw();
        if (!draw) return errorResponse("No such draw.", 404);
        const sent = await resendWinnerEmail(draw.id);
        return NextResponse.json({ ok: true, ...sent, draw: await getDraw(draw.id) });
      }

      case "promote": {
        const draw = body.drawId ? await getDraw(body.drawId) : await ensureActiveDraw();
        if (!draw) return errorResponse("No such draw.", 404);
        const result = await promoteRunnerUp(draw.id);
        return NextResponse.json({ ...result, draw: await getDraw(draw.id) });
      }

      case "claim": {
        const draw = body.drawId ? await getDraw(body.drawId) : await ensureActiveDraw();
        if (!draw) return errorResponse("No such draw.", 404);
        if (body.prizeChoice !== "console" && body.prizeChoice !== "gift_card") {
          return errorResponse("Prize choice must be console or gift_card.", 400);
        }
        await recordClaim(draw.id, body.prizeChoice);
        return NextResponse.json({ ok: true, draw: await getDraw(draw.id) });
      }

      default:
        return errorResponse("Unknown action.", 400);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    // A refused draw (already drawn, or before the draw date) is a bad request,
    // not a server fault: the caller did something the rules disallow.
    const isRuleRefusal =
      /already drawn|has not opened yet|no eligible entries|not open|not claimable/.test(message);
    return errorResponse(message, isRuleRefusal ? 409 : 500);
  }
}

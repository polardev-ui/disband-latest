import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { authenticateBot } from "@/lib/bot-auth";

// GET /api/v1/gateway?timeout=20 — long-polling event stream for bots.
//
// The client library loops on this endpoint: it blocks (server-side) until an
// event is available or the timeout elapses, then returns whatever arrived.
// Delivery is at-least-once; events are marked delivered on fetch.
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const bot = await authenticateBot(request);
  if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });

  const service = getServiceSupabase();
  if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

  const requested = Number(request.nextUrl.searchParams.get("timeout") ?? 20);
  const timeoutMs = Math.min(Math.max(Number.isFinite(requested) ? requested : 20, 1), 20) * 1000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { data: events, error } = await service.rpc("take_bot_events", { p_bot_id: bot.botId, p_limit: 50 });
    if (error) return NextResponse.json({ error: "Event delivery unavailable." }, { status: 503 });
    if (events && events.length > 0) return NextResponse.json({ events });
    if (request.signal.aborted) break;

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  return NextResponse.json({ events: [] });
}

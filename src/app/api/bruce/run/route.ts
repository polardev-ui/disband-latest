import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { ensureBruce } from "@/lib/bruce/identity";
import { deliverReminders, handleInteraction, handleMessage } from "@/lib/bruce";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Runs Bruce (migration 0244). The database calls this when an event is
 * queued for him, and every minute from pg_cron. It takes his events in
 * batches and answers each, then posts any reminders that are due. Gated on
 * the cron jobs' shared secret.
 */
function secretMatches(provided: string | null): boolean {
  if (!provided) return false;
  const expected = [process.env.BRUCE_CRON_SECRET, process.env.RAFFLE_CRON_SECRET]
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s));
  if (expected.length === 0) return false;
  const providedHash = createHash("sha256").update(provided).digest();
  return expected.some((secret) => timingSafeEqual(providedHash, createHash("sha256").update(secret).digest()));
}

// One run at a time per worker; a wake-up during a run is picked up by it.
let running: Promise<unknown> | null = null;

export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  if (!secretMatches(auth.startsWith("Bearer ") ? auth.slice(7).trim() : null)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const service = getServiceSupabase();
  if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });
  if (running) return NextResponse.json({ ok: true, busy: true });

  const work = (async () => {
    const me = await ensureBruce(service);
    if (!me) throw new Error("Bruce could not be set up");
    // Every run is a check-in, so Bruce shows online while he's working.
    await service.rpc("bot_heartbeat", { p_bot_id: me.botId });
    let handled = 0;
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      const { data: events, error } = await service.rpc("take_bot_events", { p_bot_id: me.botId, p_limit: 25 });
      if (error) throw new Error(error.message);
      const list = (events ?? []) as { id: number; type: string; payload: Record<string, unknown> }[];
      if (!list.length) break;
      await Promise.all(list.map(async (e) => {
        try {
          if (e.type === "messageCreate") await handleMessage(service, me, e.payload as never);
          else if (e.type === "interactionCreate") await handleInteraction(service, me, e.payload as never);
        } catch (err) {
          console.error("[bruce] event failed", e.type, err);
        }
      }));
      handled += list.length;
    }
    await deliverReminders(service, me).catch((err) => console.error("[bruce] reminders", err));
    return handled;
  })();

  running = work;
  try {
    const handled = await work;
    return NextResponse.json({ ok: true, handled });
  } catch (err) {
    console.error("[bruce/run]", err);
    return NextResponse.json({ error: "Bruce failed to run." }, { status: 500 });
  } finally {
    running = null;
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { authenticateBot, botJsonError } from "@/lib/bot-auth";
import { checkBotRateLimit, botRateLimited } from "@/lib/bot-gateway-guard";

type Params = { params: Promise<{ serverId: string; userId: string }> };

/** Kick a member (members.kick). */
export async function DELETE(request: NextRequest, { params }: Params) {
  const bot = await authenticateBot(request);
  if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });
  const { serverId, userId } = await params;
  const service = getServiceSupabase();
  if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });
  const gate = await checkBotRateLimit(service, "write", bot.botId);
  if (gate.limited) return botRateLimited(gate.retryAfterSeconds);
  const { error } = await service.rpc("bot_kick_member", { p_bot_id: bot.botId, p_server_id: serverId, p_user_id: userId });
  if (error) return NextResponse.json({ error: error.message }, { status: botJsonError(error) });
  return NextResponse.json({ ok: true });
}

/** Time a member out: { "timeout_minutes": 10, "reason": "…" } (members.timeout). */
export async function PATCH(request: NextRequest, { params }: Params) {
  const bot = await authenticateBot(request);
  if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });
  const { serverId, userId } = await params;
  const service = getServiceSupabase();
  if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });
  const gate = await checkBotRateLimit(service, "write", bot.botId);
  if (gate.limited) return botRateLimited(gate.retryAfterSeconds);
  const body = (await request.json().catch(() => ({}))) as { timeout_minutes?: number; reason?: string };
  const { data, error } = await service.rpc("bot_timeout_member", {
    p_bot_id: bot.botId, p_server_id: serverId, p_user_id: userId,
    p_minutes: Number(body.timeout_minutes), p_reason: typeof body.reason === "string" ? body.reason : null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: botJsonError(error) });
  return NextResponse.json({ ok: true, timed_out_until: data });
}

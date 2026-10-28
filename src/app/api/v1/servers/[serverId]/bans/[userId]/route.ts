import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { authenticateBot, botJsonError } from "@/lib/bot-auth";
import { checkBotRateLimit, botRateLimited } from "@/lib/bot-gateway-guard";

/** Ban a member: optional { "reason": "…" } (members.ban). */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ serverId: string; userId: string }> }) {
  const bot = await authenticateBot(request);
  if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });
  const { serverId, userId } = await params;
  const service = getServiceSupabase();
  if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });
  const gate = await checkBotRateLimit(service, "write", bot.botId);
  if (gate.limited) return botRateLimited(gate.retryAfterSeconds);
  const body = (await request.json().catch(() => ({}))) as { reason?: string };
  const { error } = await service.rpc("bot_ban_member", {
    p_bot_id: bot.botId, p_server_id: serverId, p_user_id: userId, p_reason: typeof body.reason === "string" ? body.reason : null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: botJsonError(error) });
  return NextResponse.json({ ok: true });
}

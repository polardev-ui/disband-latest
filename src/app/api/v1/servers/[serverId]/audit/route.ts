import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { authenticateBot, botJsonError } from "@/lib/bot-auth";
import { checkBotRateLimit, botRateLimited } from "@/lib/bot-gateway-guard";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ serverId: string }> },
) {
  try {
    const bot = await authenticateBot(request);
    if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });

    const { serverId } = await params;
    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const gate = await checkBotRateLimit(service, "read", bot.botId);
    if (gate.limited) return botRateLimited(gate.retryAfterSeconds);

    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? "100");

    const { data, error } = await service.rpc("bot_list_audit_log", {
      p_bot_id: bot.botId,
      p_server_id: serverId,
      p_limit: Number.isFinite(limit) ? limit : 100,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: botJsonError(error) });
    }

    return NextResponse.json({ audit: data ?? [] });
  } catch (err) {
    console.error("v1/servers/[serverId]/audit GET error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}
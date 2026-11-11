import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { authenticateBot, botJsonError } from "@/lib/bot-auth";
import { checkBotRateLimit, botRateLimited } from "@/lib/bot-gateway-guard";

type Params = { params: Promise<{ serverId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const bot = await authenticateBot(request);
    if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });

    const { serverId } = await params;
    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const gate = await checkBotRateLimit(service, "read", bot.botId);
    if (gate.limited) return botRateLimited(gate.retryAfterSeconds);

    const { data, error } = await service.rpc("bot_list_bans", {
      p_bot_id: bot.botId,
      p_server_id: serverId,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: botJsonError(error) });
    }

    return NextResponse.json({ bans: data ?? [] });
  } catch (err) {
    console.error("v1/servers/[serverId]/bans GET error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}
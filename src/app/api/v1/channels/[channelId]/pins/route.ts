import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { authenticateBot, botJsonError } from "@/lib/bot-auth";
import { checkBotRateLimit, botRateLimited } from "@/lib/bot-gateway-guard";

type Params = { params: Promise<{ channelId: string }> };

/** Pinned messages, newest pin first. */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const bot = await authenticateBot(request);
    if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });

    const { channelId } = await params;
    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const gate = await checkBotRateLimit(service, "read", bot.botId);
    if (gate.limited) return botRateLimited(gate.retryAfterSeconds);

    const { data, error } = await service.rpc("bot_list_pinned_messages", {
      p_bot_id: bot.botId,
      p_channel_id: channelId,
    });
    if (error) {
      const status = /not found/i.test(error.message ?? "") ? 404 : botJsonError(error);
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ pins: data ?? [] });
  } catch (err) {
    console.error("v1/channels/[channelId]/pins GET error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}

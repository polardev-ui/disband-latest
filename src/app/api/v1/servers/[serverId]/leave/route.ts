import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { authenticateBot, botJsonError } from "@/lib/bot-auth";

// POST /api/v1/servers/[serverId]/leave — the bot removes itself from a server.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ serverId: string }> },
) {
  try {
    const bot = await authenticateBot(request);
    if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });

    const { serverId } = await params;
    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const { error } = await service.rpc("bot_leave_server", {
      p_bot_id: bot.botId,
      p_server_id: serverId,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: botJsonError(error) });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("v1/servers/[serverId]/leave error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

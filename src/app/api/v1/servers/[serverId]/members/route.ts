import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { authenticateBot, botJsonError } from "@/lib/bot-auth";

// GET /api/v1/servers/[serverId]/members — member list (members.read).
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

    const { data: members, error } = await service.rpc("bot_list_members", {
      p_bot_id: bot.botId,
      p_server_id: serverId,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: botJsonError(error) });
    }

    return NextResponse.json({ members: members ?? [] });
  } catch (err) {
    console.error("v1/servers/[serverId]/members error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

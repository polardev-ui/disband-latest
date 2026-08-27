import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { authenticateBot, botJsonError } from "@/lib/bot-auth";

// GET  /api/v1/servers/[serverId]/channels — channels the bot can see.
// POST /api/v1/servers/[serverId]/channels — create a channel (channels.manage).
//   { "name": "deploys", "type": "text", "category_id": null }
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

    const { data: channels, error } = await service.rpc("bot_list_channels", {
      p_bot_id: bot.botId,
      p_server_id: serverId,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: botJsonError(error) });
    }

    return NextResponse.json({ channels: channels ?? [] });
  } catch (err) {
    console.error("v1/servers/[serverId]/channels GET error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ serverId: string }> },
) {
  try {
    const bot = await authenticateBot(request);
    if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });

    const { serverId } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      type?: "text" | "voice";
      category_id?: string | null;
    };

    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const { data: channelId, error } = await service.rpc("bot_create_channel", {
      p_bot_id: bot.botId,
      p_server_id: serverId,
      p_name: body.name,
      p_type: body.type ?? "text",
      p_category_id: body.category_id ?? null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: botJsonError(error) });
    }

    return NextResponse.json({ channel_id: channelId }, { status: 201 });
  } catch (err) {
    console.error("v1/servers/[serverId]/channels POST error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

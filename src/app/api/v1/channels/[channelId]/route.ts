import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { authenticateBot, botJsonError } from "@/lib/bot-auth";
import { checkBotRateLimit, botRateLimited } from "@/lib/bot-gateway-guard";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  try {
    const bot = await authenticateBot(request);
    if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });

    const { channelId } = await params;
    const body = (await request.json().catch(() => ({}))) as { name?: string };

    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const renameGate = await checkBotRateLimit(service, "write", bot.botId);
    if (renameGate.limited) return botRateLimited(renameGate.retryAfterSeconds);

    const { error } = await service.rpc("bot_rename_channel", {
      p_bot_id: bot.botId,
      p_channel_id: channelId,
      p_name: body.name,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: botJsonError(error) });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("v1/channels/[channelId] PATCH error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  try {
    const bot = await authenticateBot(request);
    if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });

    const { channelId } = await params;
    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const deleteGate = await checkBotRateLimit(service, "write", bot.botId);
    if (deleteGate.limited) return botRateLimited(deleteGate.retryAfterSeconds);

    const { error } = await service.rpc("bot_delete_channel", {
      p_bot_id: bot.botId,
      p_channel_id: channelId,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: botJsonError(error) });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("v1/channels/[channelId] DELETE error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}

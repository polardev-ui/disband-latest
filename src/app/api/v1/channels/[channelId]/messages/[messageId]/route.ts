import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { authenticateBot, botJsonError } from "@/lib/bot-auth";
import { checkBotRateLimit, botRateLimited } from "@/lib/bot-gateway-guard";
import { resolveMessageId } from "@/lib/bot-ids";

type Params = { params: Promise<{ channelId: string; messageId: string }> };

/**
 * Delete a message (messages.delete). A bot can always delete its own; with
 * a role that has Manage Messages it can delete anyone's, in any channel it
 * can see. `messageId` is the message's id or its numeric display_id.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const bot = await authenticateBot(request);
    if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });
    const { channelId, messageId } = await params;
    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });
    const gate = await checkBotRateLimit(service, "write", bot.botId);
    if (gate.limited) return botRateLimited(gate.retryAfterSeconds);

    const id = await resolveMessageId(service, messageId, channelId);
    if (!id) return NextResponse.json({ error: "Message not found" }, { status: 404 });

    const { error } = await service.rpc("bot_delete_message", {
      p_bot_id: bot.botId,
      p_channel_id: channelId,
      p_message_id: id,
    });
    if (error) {
      const status = /not found/i.test(error.message ?? "") ? 404 : botJsonError(error);
      return NextResponse.json({ error: error.message }, { status });
    }
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("v1/channels/[channelId]/messages/[messageId] DELETE error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}

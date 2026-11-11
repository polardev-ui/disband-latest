import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { authenticateBot, botJsonError } from "@/lib/bot-auth";
import { checkBotRateLimit, botRateLimited } from "@/lib/bot-gateway-guard";
import { resolveMessageId } from "@/lib/bot-ids";

type Params = { params: Promise<{ channelId: string; messageId: string; emoji: string }> };

function statusFor(error: { message?: string }): number {
  if (/not found/i.test(error.message ?? "")) return 404;
  if (/permission denied/i.test(error.message ?? "")) return 403;
  return botJsonError(error);
}

/** Add the bot's reaction (messages.react + add_reactions in that channel). */
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const bot = await authenticateBot(request);
    if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });

    const { channelId, messageId, emoji } = await params;
    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const gate = await checkBotRateLimit(service, "write", bot.botId);
    if (gate.limited) return botRateLimited(gate.retryAfterSeconds);

    const id = await resolveMessageId(service, messageId, channelId);
    if (!id) return NextResponse.json({ error: "Message not found" }, { status: 404 });

    const { data, error } = await service.rpc("bot_add_reaction", {
      p_bot_id: bot.botId,
      p_channel_id: channelId,
      p_message_id: id,
      p_emoji: emoji,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: statusFor(error) });

    return NextResponse.json({ reaction: data });
  } catch (err) {
    console.error("v1/channels/[channelId]/messages/[messageId]/reactions PUT error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}

/** Remove the bot's own reaction. Idempotent: removing a missing reaction is fine. */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const bot = await authenticateBot(request);
    if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });

    const { channelId, messageId, emoji } = await params;
    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const gate = await checkBotRateLimit(service, "write", bot.botId);
    if (gate.limited) return botRateLimited(gate.retryAfterSeconds);

    const id = await resolveMessageId(service, messageId, channelId);
    if (!id) return NextResponse.json({ error: "Message not found" }, { status: 404 });

    const { data, error } = await service.rpc("bot_remove_reaction", {
      p_bot_id: bot.botId,
      p_channel_id: channelId,
      p_message_id: id,
      p_emoji: emoji,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: statusFor(error) });

    return NextResponse.json({ removed: data === true });
  } catch (err) {
    console.error("v1/channels/[channelId]/messages/[messageId]/reactions DELETE error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}

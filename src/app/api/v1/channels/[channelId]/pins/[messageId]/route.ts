import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { authenticateBot, botJsonError } from "@/lib/bot-auth";
import { checkBotRateLimit, botRateLimited } from "@/lib/bot-gateway-guard";
import { resolveMessageId } from "@/lib/bot-ids";

type Params = { params: Promise<{ channelId: string; messageId: string }> };

function statusFor(error: { message?: string }): number {
  if (/not found/i.test(error.message ?? "")) return 404;
  if (/permission|pin_messages/i.test(error.message ?? "")) return 403;
  return botJsonError(error);
}

/** Pin a message (requires the pin_messages role permission). Idempotent. */
export async function PUT(request: NextRequest, { params }: Params) {
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

    const { data, error } = await service.rpc("bot_pin_message", {
      p_bot_id: bot.botId,
      p_channel_id: channelId,
      p_message_id: id,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: statusFor(error) });

    return NextResponse.json({ pin: data });
  } catch (err) {
    console.error("v1/channels/[channelId]/pins/[messageId] PUT error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}

/** Unpin a message. Idempotent. */
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

    const { data, error } = await service.rpc("bot_unpin_message", {
      p_bot_id: bot.botId,
      p_channel_id: channelId,
      p_message_id: id,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: statusFor(error) });

    return NextResponse.json({ removed: data === true });
  } catch (err) {
    console.error("v1/channels/[channelId]/pins/[messageId] DELETE error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}

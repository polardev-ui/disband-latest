import { NextRequest, NextResponse } from "next/server";
import { resolveMessageId } from "@/lib/bot-ids";
import { rpcError, withBot } from "@/lib/bot-route";

type Params = { params: Promise<{ channelId: string; messageId: string }> };

/** Every emoji on a message, with counts and whether the bot used it (messages.read). */
export async function GET(request: NextRequest, { params }: Params) {
  return withBot(request, "read", "v1 reactions GET", async (bot, service) => {
    const { channelId, messageId } = await params;
    const id = await resolveMessageId(service, messageId, channelId);
    if (!id) return NextResponse.json({ error: "Message not found" }, { status: 404 });

    const { data, error } = await service.rpc("bot_list_reactions", {
      p_bot_id: bot.botId,
      p_channel_id: channelId,
      p_message_id: id,
    });
    if (error) return rpcError(error);
    return NextResponse.json({ reactions: data ?? [] });
  });
}

/**
 * Clears reactions: all of them, or one emoji's with `?emoji=`
 * (messages.delete + the manage_messages role permission).
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  return withBot(request, "write", "v1 reactions DELETE", async (bot, service) => {
    const { channelId, messageId } = await params;
    const id = await resolveMessageId(service, messageId, channelId);
    if (!id) return NextResponse.json({ error: "Message not found" }, { status: 404 });

    const { data, error } = await service.rpc("bot_remove_reactions", {
      p_bot_id: bot.botId,
      p_channel_id: channelId,
      p_message_id: id,
      p_emoji: request.nextUrl.searchParams.get("emoji") || null,
    });
    if (error) return rpcError(error);
    return NextResponse.json({ removed: data ?? 0 });
  });
}

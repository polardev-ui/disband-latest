import { NextRequest, NextResponse } from "next/server";
import { isUuid, resolveMessageId } from "@/lib/bot-ids";
import { isMe, rpcError, withBot } from "@/lib/bot-route";

type Params = { params: Promise<{ channelId: string; messageId: string; emoji: string; userId: string }> };

/**
 * Removes one person's reaction. `@me` is the bot's own (messages.react);
 * anyone else's needs messages.delete and the manage_messages role permission.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  return withBot(request, "write", "v1 reaction user DELETE", async (bot, service) => {
    const { channelId, messageId, emoji, userId } = await params;
    const id = await resolveMessageId(service, messageId, channelId);
    if (!id) return NextResponse.json({ error: "Message not found" }, { status: 404 });

    if (isMe(userId) || userId === bot.userId) {
      const { data, error } = await service.rpc("bot_remove_reaction", {
        p_bot_id: bot.botId,
        p_channel_id: channelId,
        p_message_id: id,
        p_emoji: emoji,
      });
      if (error) return rpcError(error);
      return NextResponse.json({ removed: Boolean(data) });
    }

    if (!isUuid(userId)) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const { data, error } = await service.rpc("bot_remove_reactions", {
      p_bot_id: bot.botId,
      p_channel_id: channelId,
      p_message_id: id,
      p_emoji: emoji,
      p_user_id: userId,
    });
    if (error) return rpcError(error);
    return NextResponse.json({ removed: Number(data ?? 0) > 0 });
  });
}

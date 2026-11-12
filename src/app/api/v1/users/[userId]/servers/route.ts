import { NextRequest, NextResponse } from "next/server";
import { isMe, rpcError, withBot } from "@/lib/bot-route";

/** `@me` only: every space the bot is in, with the scopes it was granted there. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  return withBot(request, "read", "v1 users servers GET", async (bot, service) => {
    const { userId } = await params;
    if (!isMe(userId) && userId !== bot.userId) {
      return NextResponse.json({ error: "Only @me has a server list" }, { status: 404 });
    }
    const { data, error } = await service.rpc("bot_list_servers", { p_bot_id: bot.botId });
    if (error) return rpcError(error);
    return NextResponse.json({ servers: data ?? [] });
  });
}

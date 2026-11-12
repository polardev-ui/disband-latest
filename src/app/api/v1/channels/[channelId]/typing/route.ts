import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { rpcError, withBot } from "@/lib/bot-route";

/**
 * Shows "<bot> is typing…" in a channel for a few seconds (messages.write and
 * permission to post there). Send it again to keep it showing while a long
 * answer is on its way; it clears when the bot's message arrives.
 *
 * Calls closer than two seconds apart for the same channel are accepted and
 * coalesced, so a loop that fires it freely doesn't spend the rate limit.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ channelId: string }> }) {
  return withBot(request, "read", "v1 typing POST", async (bot, service) => {
    const { channelId } = await params;
    const { data, error } = await service.rpc("bot_typing_gate", {
      p_bot_id: bot.botId,
      p_channel_id: channelId,
    });
    if (error) return rpcError(error);

    if (!rateLimit(`bot-typing:${bot.botId}:${channelId}`, 1, 2000).allowed) {
      return new NextResponse(null, { status: 204 });
    }

    const gate = data as { user_id: string; server_id: string; name: string };
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      // The same broadcasts a person's client sends (useTypingPresence):
      // the channel's own topic, and the server's, for the sidebar.
      await fetch(`${url}/realtime/v1/api/broadcast`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { topic: `typing:ch:${channelId}`, event: "typing", payload: { userId: gate.user_id, name: gate.name } },
            { topic: `typing:server:${gate.server_id}`, event: "typing", payload: { userId: gate.user_id, channelId } },
          ],
        }),
        signal: AbortSignal.timeout(4000),
      }).catch(() => undefined);
    }
    return new NextResponse(null, { status: 204 });
  });
}

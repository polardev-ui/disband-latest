import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { authenticateBot, botJsonError } from "@/lib/bot-auth";
import { checkBotRateLimit, botRateLimited } from "@/lib/bot-gateway-guard";

type Params = { params: Promise<{ channelId: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Delete up to 100 messages from one channel: { "message_ids": ["…"] }. */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const bot = await authenticateBot(request);
    if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });

    const { channelId } = await params;
    const body = (await request.json().catch(() => ({}))) as { message_ids?: unknown };
    if (!Array.isArray(body.message_ids) || body.message_ids.length === 0) {
      return NextResponse.json({ error: "message_ids is required" }, { status: 400 });
    }
    if (body.message_ids.length > 100) {
      return NextResponse.json({ error: "At most 100 messages can be deleted at once" }, { status: 400 });
    }
    if (!body.message_ids.every((id) => typeof id === "string" && UUID.test(id))) {
      return NextResponse.json({ error: "Every message id must be a UUID" }, { status: 400 });
    }

    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const gate = await checkBotRateLimit(service, "write", bot.botId);
    if (gate.limited) return botRateLimited(gate.retryAfterSeconds);

    const { data, error } = await service.rpc("bot_bulk_delete_messages", {
      p_bot_id: bot.botId,
      p_channel_id: channelId,
      p_message_ids: body.message_ids,
    });
    if (error) {
      const status = /not found/i.test(error.message ?? "") ? 404 : botJsonError(error);
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ deleted: data ?? 0 });
  } catch (err) {
    console.error("v1/channels/[channelId]/messages/bulk-delete POST error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}

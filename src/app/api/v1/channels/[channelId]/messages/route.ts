import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { authenticateBot, botJsonError } from "@/lib/bot-auth";
import { checkBotRateLimit, botRateLimited } from "@/lib/bot-gateway-guard";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  try {
    const bot = await authenticateBot(request);
    if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });

    const { channelId } = await params;
    const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") ?? 50), 1), 100);
    const before = request.nextUrl.searchParams.get("before");

    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const readGate = await checkBotRateLimit(service, "read", bot.botId);
    if (readGate.limited) return botRateLimited(readGate.retryAfterSeconds);

    const { data: messages, error } = await service.rpc("bot_list_messages", {
      p_bot_id: bot.botId,
      p_channel_id: channelId,
      p_limit: limit,
      p_before_id: before || null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: botJsonError(error) });
    }

    return NextResponse.json({ messages: messages ?? [] });
  } catch (err) {
    console.error("v1/channels/[channelId]/messages GET error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  try {
    const bot = await authenticateBot(request);
    if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });

    const { channelId } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      content?: string;
      reply_to_id?: string | null;
    };

    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const writeGate = await checkBotRateLimit(service, "write", bot.botId);
    if (writeGate.limited) return botRateLimited(writeGate.retryAfterSeconds);

    const { data: message, error } = await service.rpc("bot_send_message", {
      p_bot_id: bot.botId,
      p_channel_id: channelId,
      p_content: body.content,
      p_reply_to_id: body.reply_to_id ?? null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: botJsonError(error) });
    }

    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    console.error("v1/channels/[channelId]/messages POST error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}

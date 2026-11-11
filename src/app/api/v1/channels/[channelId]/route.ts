import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { authenticateBot, botJsonError } from "@/lib/bot-auth";
import { checkBotRateLimit, botRateLimited } from "@/lib/bot-gateway-guard";

type Params = { params: Promise<{ channelId: string }> };

function statusFor(error: { message?: string }): number {
  if (/not found|permission denied/i.test(error.message ?? "")) return 404;
  return botJsonError(error);
}

/** Channel detail, including effective permissions and role overwrites (when manageable). */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const bot = await authenticateBot(request);
    if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });

    const { channelId } = await params;
    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const gate = await checkBotRateLimit(service, "read", bot.botId);
    if (gate.limited) return botRateLimited(gate.retryAfterSeconds);

    const { data, error } = await service.rpc("bot_get_channel", {
      p_bot_id: bot.botId,
      p_channel_id: channelId,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: statusFor(error) });

    return NextResponse.json({ channel: data });
  } catch (err) {
    console.error("v1/channels/[channelId] GET error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}

/** Update a channel: name, topic, slow_mode_seconds, category_id, position, read_only, locked, user_limit. */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const bot = await authenticateBot(request);
    if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });

    const { channelId } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "A JSON object of channel fields is required" }, { status: 400 });
    }
    if (Object.keys(body).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const gate = await checkBotRateLimit(service, "write", bot.botId);
    if (gate.limited) return botRateLimited(gate.retryAfterSeconds);

    const { data, error } = await service.rpc("bot_update_channel", {
      p_bot_id: bot.botId,
      p_channel_id: channelId,
      p_patch: body,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: statusFor(error) });

    return NextResponse.json({ channel: data });
  } catch (err) {
    console.error("v1/channels/[channelId] PATCH error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}

/** Delete a channel and its messages. */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const bot = await authenticateBot(request);
    if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });

    const { channelId } = await params;
    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const gate = await checkBotRateLimit(service, "write", bot.botId);
    if (gate.limited) return botRateLimited(gate.retryAfterSeconds);

    const { error } = await service.rpc("bot_delete_channel", {
      p_bot_id: bot.botId,
      p_channel_id: channelId,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: statusFor(error) });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("v1/channels/[channelId] DELETE error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}

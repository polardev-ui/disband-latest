import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { authenticateBot, botJsonError } from "@/lib/bot-auth";
import { checkBotRateLimit, botRateLimited } from "@/lib/bot-gateway-guard";

type Params = { params: Promise<{ serverId: string }> };

/** Visible channels, lowest position first. Private channels are omitted without can_view. */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const bot = await authenticateBot(request);
    if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });

    const { serverId } = await params;
    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const gate = await checkBotRateLimit(service, "read", bot.botId);
    if (gate.limited) return botRateLimited(gate.retryAfterSeconds);

    const { data, error } = await service.rpc("bot_list_channels", {
      p_bot_id: bot.botId,
      p_server_id: serverId,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: botJsonError(error) });

    return NextResponse.json({ channels: data ?? [] });
  } catch (err) {
    console.error("v1/servers/[serverId]/channels GET error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}

/**
 * Create a channel. `permissions` is a list of role overwrites; hide a channel
 * from @everyone by setting `{ "role_id": "<everyone>", "can_view": false }`.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const bot = await authenticateBot(request);
    if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });

    const { serverId } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      type?: "text" | "voice";
      category_id?: string | null;
      topic?: string | null;
      slow_mode_seconds?: number;
      read_only?: boolean;
      user_limit?: number | null;
      permissions?: Array<{
        role_id: string;
        can_view?: boolean | null;
        can_post?: boolean | null;
        can_react?: boolean | null;
        can_attach?: boolean | null;
      }>;
    };

    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const gate = await checkBotRateLimit(service, "write", bot.botId);
    if (gate.limited) return botRateLimited(gate.retryAfterSeconds);

    const { data: channelId, error } = await service.rpc("bot_create_channel", {
      p_bot_id: bot.botId,
      p_server_id: serverId,
      p_name: body.name ?? null,
      p_type: body.type ?? "text",
      p_category_id: body.category_id ?? null,
      p_topic: body.topic ?? null,
      p_slow_mode_seconds: body.slow_mode_seconds ?? 0,
      p_read_only: body.read_only ?? false,
      p_user_limit: body.user_limit ?? null,
      p_permissions: body.permissions ?? null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: botJsonError(error) });

    const { data: channel } = await service.rpc("bot_get_channel", {
      p_bot_id: bot.botId,
      p_channel_id: channelId,
    });

    return NextResponse.json({ channel_id: channelId, channel }, { status: 201 });
  } catch (err) {
    console.error("v1/servers/[serverId]/channels POST error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { authenticateBot, botJsonError } from "@/lib/bot-auth";
import { checkBotRateLimit, botRateLimited } from "@/lib/bot-gateway-guard";

type Params = { params: Promise<{ serverId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const bot = await authenticateBot(request);
    if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });

    const { serverId } = await params;
    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const gate = await checkBotRateLimit(service, "read", bot.botId);
    if (gate.limited) return botRateLimited(gate.retryAfterSeconds);

    const { data: member } = await service
      .from("server_members")
      .select("user_id")
      .eq("server_id", serverId)
      .eq("user_id", bot.userId)
      .maybeSingle();
    if (!member) {
      return NextResponse.json({ error: "Bot is not a member of this server" }, { status: 403 });
    }

    const { data: grant } = await service
      .from("bot_grants")
      .select("scopes")
      .eq("bot_id", bot.botId)
      .eq("server_id", serverId)
      .maybeSingle();
    const scopes = (grant?.scopes as string[] | undefined) ?? [];
    if (!scopes.includes("messages.read") && !scopes.includes("channels.manage")) {
      return NextResponse.json({ error: "Missing required scope" }, { status: 403 });
    }

    const { data: categories, error } = await service
      .from("channel_categories")
      .select("id, server_id, name, position")
      .eq("server_id", serverId)
      .order("position");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: botJsonError(error) });
    }

    return NextResponse.json({ categories: categories ?? [] });
  } catch (err) {
    console.error("v1/servers/[serverId]/categories GET error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}
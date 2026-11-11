import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { authenticateBot, botJsonError } from "@/lib/bot-auth";
import { checkBotRateLimit, botRateLimited } from "@/lib/bot-gateway-guard";

type Params = { params: Promise<{ serverId: string }> };

/** Basic server info for bots with read access. */
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
    if (!scopes.includes("messages.read") && !scopes.includes("channels.manage") && !scopes.includes("servers:read")) {
      return NextResponse.json({ error: "Missing required scope" }, { status: 403 });
    }

    const { data: server, error } = await service
      .from("servers")
      .select("id, name, description, icon_url, banner_url, owner_id, created_at, discoverable, verified")
      .eq("id", serverId)
      .maybeSingle();

    if (error || !server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    const { count } = await service
      .from("server_members")
      .select("user_id", { count: "exact", head: true })
      .eq("server_id", serverId);

    return NextResponse.json({ server: { ...server, member_count: count ?? 0 } });
  } catch (err) {
    console.error("v1/servers/[serverId] GET error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}
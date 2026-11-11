import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { authenticateBot, botJsonError } from "@/lib/bot-auth";
import { checkBotRateLimit, botRateLimited } from "@/lib/bot-gateway-guard";

type Params = { params: Promise<{ serverId: string }> };

/** Server metadata and member count. */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const bot = await authenticateBot(request);
    if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });

    const { serverId } = await params;
    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const gate = await checkBotRateLimit(service, "read", bot.botId);
    if (gate.limited) return botRateLimited(gate.retryAfterSeconds);

    const { error: authError } = await service.rpc("bot_actor", {
      p_bot_id: bot.botId,
      p_server_id: serverId,
      p_scopes: ["servers.read", "messages.read", "channels.read", "channels.manage", "members.read"],
      p_permission: null,
    });
    if (authError) return NextResponse.json({ error: authError.message }, { status: botJsonError(authError) });

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

/** Update server settings: { name?, description?, discoverable? } (manage_server). */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const bot = await authenticateBot(request);
    if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });

    const { serverId } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length === 0) {
      return NextResponse.json({ error: "A JSON object of server fields is required" }, { status: 400 });
    }

    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const gate = await checkBotRateLimit(service, "write", bot.botId);
    if (gate.limited) return botRateLimited(gate.retryAfterSeconds);

    const { data, error } = await service.rpc("bot_update_server", {
      p_bot_id: bot.botId,
      p_server_id: serverId,
      p_patch: body,
    });
    if (error) {
      const status = /not found/i.test(error.message ?? "") ? 404 : botJsonError(error);
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ server: data });
  } catch (err) {
    console.error("v1/servers/[serverId] PATCH error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}

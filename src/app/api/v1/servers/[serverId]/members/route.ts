import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { authenticateBot, botJsonError } from "@/lib/bot-auth";
import { checkBotRateLimit, botRateLimited } from "@/lib/bot-gateway-guard";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ serverId: string }> },
) {
  try {
    const bot = await authenticateBot(request);
    if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });

    const { serverId } = await params;
    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const gate = await checkBotRateLimit(service, "read", bot.botId);
    if (gate.limited) return botRateLimited(gate.retryAfterSeconds);

    const { data: members, error } = await service.rpc("bot_list_members", {
      p_bot_id: bot.botId,
      p_server_id: serverId,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: botJsonError(error) });
    }

    // Optional filters: ?query= (username or display name contains it),
    // ?role= (a role id), ?limit= (1–1000). Without them, everyone.
    type Member = { username?: string | null; display_name?: string | null; roles?: string[] | null };
    const search = request.nextUrl.searchParams;
    const query = search.get("query")?.trim().toLowerCase() ?? "";
    const role = search.get("role")?.trim().toLowerCase() ?? "";
    const limit = Number(search.get("limit"));
    let list = (members ?? []) as Member[];
    if (query) {
      list = list.filter((m) =>
        [m.username, m.display_name].some((v) => typeof v === "string" && v.toLowerCase().includes(query)),
      );
    }
    if (role) list = list.filter((m) => (m.roles ?? []).some((r) => String(r).toLowerCase() === role));
    if (Number.isFinite(limit) && limit >= 1) list = list.slice(0, Math.min(Math.floor(limit), 1000));

    return NextResponse.json({ members: list });
  } catch (err) {
    console.error("v1/servers/[serverId]/members error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}

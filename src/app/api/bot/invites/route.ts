import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/server-auth";
import { isBotScope } from "@/lib/bot-auth";
import { PUBLIC_ENV } from "@/lib/public-env";

// POST /api/bot/invites — a bot owner creates an invite so a server owner can
// approve the bot joining. Body: { botId, serverId, scopes }.
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const body = (await request.json().catch(() => ({}))) as {
      botId?: string;
      serverId?: string;
      scopes?: string[];
    };

    if (!body.botId || !body.serverId || !Array.isArray(body.scopes) || body.scopes.length === 0) {
      return NextResponse.json({ error: "botId, serverId and scopes are required." }, { status: 400 });
    }
    if (!body.scopes.every(isBotScope)) {
      return NextResponse.json({ error: "Invalid scope." }, { status: 400 });
    }

    const { data: code, error } = await service.rpc("bot_create_invite", {
      p_bot_id: body.botId,
      p_actor_id: user.id,
      p_server_id: body.serverId,
      p_scopes: body.scopes,
    });

    if (error) {
      if (/Only the bot owner/.test(error.message)) {
        return NextResponse.json({ error: "Only the bot owner can generate invites." }, { status: 403 });
      }
      if (/not found|scopes/.test(error.message)) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const inviteUrl = `${PUBLIC_ENV.webAppUrl}/bot-invite/${code}`;
    return NextResponse.json({ code, invite_url: inviteUrl });
  } catch (err) {
    console.error("bot/invites POST error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

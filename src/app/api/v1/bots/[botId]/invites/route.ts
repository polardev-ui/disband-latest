import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { authenticateBot, isBotScope } from "@/lib/bot-auth";
import { PUBLIC_ENV } from "@/lib/public-env";

// POST /api/v1/bots/[botId]/invites — a bot generates an invite for itself.
// The bot's owner acts on its behalf (the bot is not a logged-in session).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ botId: string }> },
) {
  try {
    const bot = await authenticateBot(request);
    if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });

    const { botId } = await params;
    if (botId !== bot.botId) {
      return NextResponse.json({ error: "Token does not belong to this bot." }, { status: 403 });
    }

    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const body = (await request.json().catch(() => ({}))) as {
      server_id?: string;
      scopes?: string[];
    };

    if (!body.server_id || !Array.isArray(body.scopes) || body.scopes.length === 0) {
      return NextResponse.json({ error: "server_id and scopes are required." }, { status: 400 });
    }
    if (!body.scopes.every(isBotScope)) {
      return NextResponse.json({ error: "Invalid scope." }, { status: 400 });
    }

    const { data: code, error } = await service.rpc("bot_create_invite", {
      p_bot_id: bot.botId,
      p_actor_id: bot.userId,
      p_server_id: body.server_id,
      p_scopes: body.scopes,
    });

    if (error) {
      if (/not found|scopes/.test(error.message)) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      code,
      invite_url: `${PUBLIC_ENV.webAppUrl}/bot-invite/${code}`,
    });
  } catch (err) {
    console.error("v1/bots/[botId]/invites error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

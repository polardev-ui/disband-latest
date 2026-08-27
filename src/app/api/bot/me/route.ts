import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { authenticateBot } from "@/lib/bot-auth";

// GET /api/bot/me — the bot's own identity (bot token). Used by client
// libraries on connect() to resolve the bot id and profile.
export async function GET(request: NextRequest) {
  try {
    const bot = await authenticateBot(request);
    if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });

    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const { data: profile } = await service
      .from("profiles")
      .select("id, username, display_name, avatar_url, is_bot")
      .eq("id", bot.userId)
      .maybeSingle();

    return NextResponse.json({
      bot: {
        id: bot.botId,
        user_id: bot.userId,
        name: bot.name,
        username: profile?.username ?? null,
        avatar_url: bot.avatarUrl ?? profile?.avatar_url ?? null,
        scopes: bot.scopes,
      },
    });
  } catch (err) {
    console.error("bot/me error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

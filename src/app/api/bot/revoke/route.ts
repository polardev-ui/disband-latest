import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/server-auth";

// POST /api/bot/revoke — permanently disable a bot and its token.
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const body = (await request.json().catch(() => ({}))) as { botId?: string };
    if (!body.botId) {
      return NextResponse.json({ error: "botId is required." }, { status: 400 });
    }

    const { data: bot, error: fetchError } = await service
      .from("bots")
      .select("owner_id")
      .eq("id", body.botId)
      .maybeSingle();
    if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
    if (!bot) return NextResponse.json({ error: "Bot not found." }, { status: 404 });
    if (bot.owner_id !== user.id) {
      return NextResponse.json({ error: "Only the bot owner can revoke it." }, { status: 403 });
    }

    const { error } = await service
      .from("bots")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", body.botId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("bot/revoke error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

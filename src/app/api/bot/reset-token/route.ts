import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/server-auth";
import { hashBotToken } from "@/lib/bot-auth";
import { checkBotRateLimit, botRateLimited } from "@/lib/bot-gateway-guard";

/** Replace a bot's token. The old one stops working at once; the new one is shown once. */
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const gate = await checkBotRateLimit(service, "invite", `reset:${user.id}`);
    if (gate.limited) return botRateLimited(gate.retryAfterSeconds);

    const body = (await request.json().catch(() => ({}))) as { botId?: string };
    if (!body.botId) return NextResponse.json({ error: "botId is required." }, { status: 400 });

    const token = `db_bot_${randomBytes(32).toString("hex")}`;
    const { data, error } = await service
      .from("bots")
      .update({ token_hash: hashBotToken(token), token_prefix: token.slice(0, 12) })
      .eq("id", body.botId)
      .eq("owner_id", user.id)
      .is("revoked_at", null)
      .select("id")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Bot not found or not owned by you." }, { status: 404 });

    return NextResponse.json({ token });
  } catch (err) {
    console.error("bot/reset-token error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}

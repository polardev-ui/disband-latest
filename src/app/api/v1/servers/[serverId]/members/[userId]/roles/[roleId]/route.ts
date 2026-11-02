import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { authenticateBot, botJsonError } from "@/lib/bot-auth";
import { checkBotRateLimit, botRateLimited } from "@/lib/bot-gateway-guard";

type Params = { params: Promise<{ serverId: string; userId: string; roleId: string }> };

async function change(request: NextRequest, { params }: Params, fn: "bot_add_member_role" | "bot_remove_member_role") {
  const bot = await authenticateBot(request);
  if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });
  const { serverId, userId, roleId } = await params;
  const service = getServiceSupabase();
  if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });
  const gate = await checkBotRateLimit(service, "write", bot.botId);
  if (gate.limited) return botRateLimited(gate.retryAfterSeconds);
  const { error } = await service.rpc(fn, { p_bot_id: bot.botId, p_server_id: serverId, p_user_id: userId, p_role_id: roleId });
  if (error) return NextResponse.json({ error: error.message }, { status: botJsonError(error) });
  return NextResponse.json({ ok: true });
}

/** Give a member a role below the bot's own (roles.manage). */
export function PUT(request: NextRequest, ctx: Params) {
  return change(request, ctx, "bot_add_member_role");
}

/** Take a role from a member (roles.manage). */
export function DELETE(request: NextRequest, ctx: Params) {
  return change(request, ctx, "bot_remove_member_role");
}

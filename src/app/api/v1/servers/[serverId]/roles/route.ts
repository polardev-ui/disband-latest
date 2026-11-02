import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { authenticateBot, botJsonError } from "@/lib/bot-auth";
import { checkBotRateLimit, botRateLimited } from "@/lib/bot-gateway-guard";
import { readRoleBody } from "./role-body";

type Params = { params: Promise<{ serverId: string }> };

/** List roles, highest first (roles.manage or members.read). */
export async function GET(request: NextRequest, { params }: Params) {
  const bot = await authenticateBot(request);
  if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });
  const { serverId } = await params;
  const service = getServiceSupabase();
  if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });
  const gate = await checkBotRateLimit(service, "read", bot.botId);
  if (gate.limited) return botRateLimited(gate.retryAfterSeconds);
  const { data, error } = await service.rpc("bot_list_roles", { p_bot_id: bot.botId, p_server_id: serverId });
  if (error) return NextResponse.json({ error: error.message }, { status: botJsonError(error) });
  return NextResponse.json({ roles: data ?? [] });
}

/** Create a role: { name, color?, permissions?, self_assignable?, position? } (roles.manage). */
export async function POST(request: NextRequest, { params }: Params) {
  const bot = await authenticateBot(request);
  if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });
  const { serverId } = await params;
  const body = readRoleBody(await request.json().catch(() => null));
  if ("error" in body) return NextResponse.json({ error: body.error }, { status: 400 });
  const service = getServiceSupabase();
  if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });
  const gate = await checkBotRateLimit(service, "write", bot.botId);
  if (gate.limited) return botRateLimited(gate.retryAfterSeconds);
  const { data, error } = await service.rpc("bot_create_role", {
    p_bot_id: bot.botId,
    p_server_id: serverId,
    p_name: body.name ?? null,
    p_color: body.color ?? null,
    p_permissions: body.permissions ?? null,
    p_self_assignable: body.self_assignable ?? false,
    p_position: body.position ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: botJsonError(error) });
  return NextResponse.json({ role: data }, { status: 201 });
}

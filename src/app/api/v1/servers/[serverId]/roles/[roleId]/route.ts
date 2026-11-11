import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { authenticateBot, botJsonError } from "@/lib/bot-auth";
import { checkBotRateLimit, botRateLimited } from "@/lib/bot-gateway-guard";
import { readRoleBody } from "../role-body";
import { resolveRoleId } from "@/lib/bot-ids";

type Params = { params: Promise<{ serverId: string; roleId: string }> };

/** Single role, including whether this bot can manage it. */
export async function GET(request: NextRequest, { params }: Params) {
  const bot = await authenticateBot(request);
  if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });
  const { serverId, roleId } = await params;
  const service = getServiceSupabase();
  if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });
  const gate = await checkBotRateLimit(service, "read", bot.botId);
  if (gate.limited) return botRateLimited(gate.retryAfterSeconds);
  const role = await resolveRoleId(service, roleId);
  if (!role || !(await roleInServer(service, role, serverId))) return NextResponse.json({ error: "Role not found" }, { status: 404 });
  const { data, error } = await service.rpc("bot_get_role", { p_bot_id: bot.botId, p_role_id: role });
  if (error) {
    const status = /not found/i.test(error.message ?? "") ? 404 : botJsonError(error);
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json({ role: data });
}

/** Edit a role below the bot's own: { name?, color?, permissions?, self_assignable?, position? } (roles.manage). */
export async function PATCH(request: NextRequest, { params }: Params) {
  const bot = await authenticateBot(request);
  if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });
  const { serverId, roleId } = await params;
  const body = readRoleBody(await request.json().catch(() => null));
  if ("error" in body) return NextResponse.json({ error: body.error }, { status: 400 });
  const service = getServiceSupabase();
  if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });
  const gate = await checkBotRateLimit(service, "write", bot.botId);
  if (gate.limited) return botRateLimited(gate.retryAfterSeconds);
  const role = await resolveRoleId(service, roleId);
  if (!role || !(await roleInServer(service, role, serverId))) return NextResponse.json({ error: "Role not found" }, { status: 404 });
  const { data, error } = await service.rpc("bot_update_role", {
    p_bot_id: bot.botId,
    p_role_id: role,
    p_name: body.name ?? null,
    p_color: body.color ?? null,
    p_permissions: body.permissions ?? null,
    p_self_assignable: body.self_assignable ?? null,
    p_position: body.position ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: botJsonError(error) });
  return NextResponse.json({ role: data });
}

/** Delete a role below the bot's own (roles.manage). */
export async function DELETE(request: NextRequest, { params }: Params) {
  const bot = await authenticateBot(request);
  if (!bot) return NextResponse.json({ error: "Invalid bot token" }, { status: 401 });
  const { serverId, roleId } = await params;
  const service = getServiceSupabase();
  if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });
  const gate = await checkBotRateLimit(service, "write", bot.botId);
  if (gate.limited) return botRateLimited(gate.retryAfterSeconds);
  const role = await resolveRoleId(service, roleId);
  if (!role || !(await roleInServer(service, role, serverId))) return NextResponse.json({ error: "Role not found" }, { status: 404 });
  const { error } = await service.rpc("bot_delete_role", { p_bot_id: bot.botId, p_role_id: role });
  if (error) return NextResponse.json({ error: error.message }, { status: botJsonError(error) });
  return NextResponse.json({ ok: true });
}

async function roleInServer(service: NonNullable<ReturnType<typeof getServiceSupabase>>, roleId: string, serverId: string) {
  const { data } = await service.from("server_roles").select("id").eq("id", roleId).eq("server_id", serverId).maybeSingle();
  return !!data;
}

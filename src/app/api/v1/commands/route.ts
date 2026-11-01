import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { authenticateBot } from "@/lib/bot-auth";
import { checkBotRateLimit, botRateLimited } from "@/lib/bot-gateway-guard";
import { normalizeCommand, normalizeCommands } from "@/lib/bot-commands";

/*
 A bot's slash commands. They are global: every space the bot is in offers
 them in the composer.

   GET     list them
   PUT     replace them all with the list sent (bulk overwrite, like Discord)
   POST    create or update one, by name
   DELETE  ?name=weather removes one
*/

async function listCommands(botId: string) {
  const service = getServiceSupabase()!;
  const { data } = await service
    .from("bot_commands")
    .select("id, name, description, options, created_at, updated_at")
    .eq("bot_id", botId)
    .order("name");
  return data ?? [];
}

async function gate(request: NextRequest, bucket: "read" | "write") {
  const bot = await authenticateBot(request);
  if (!bot) return { error: NextResponse.json({ error: "Invalid bot token" }, { status: 401 }) };
  const service = getServiceSupabase();
  if (!service) return { error: NextResponse.json({ error: "Service not available" }, { status: 500 }) };
  const limit = await checkBotRateLimit(service, bucket, bot.botId);
  if (limit.limited) return { error: botRateLimited(limit.retryAfterSeconds) };
  return { bot, service };
}

export async function GET(request: NextRequest) {
  const g = await gate(request, "read");
  if ("error" in g) return g.error;
  return NextResponse.json({ commands: await listCommands(g.bot.botId) });
}

export async function PUT(request: NextRequest) {
  const g = await gate(request, "write");
  if ("error" in g) return g.error;
  const body = await request.json().catch(() => null);
  const parsed = normalizeCommands(Array.isArray(body) ? body : (body as { commands?: unknown } | null)?.commands);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { bot, service } = g;
  const names = parsed.value.map((c) => c.name);
  const del = service.from("bot_commands").delete().eq("bot_id", bot.botId);
  const { error: delError } = names.length
    ? await del.not("name", "in", `(${names.map((n) => `"${n}"`).join(",")})`)
    : await del;
  if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });
  if (names.length) {
    const { error } = await service
      .from("bot_commands")
      .upsert(parsed.value.map((c) => ({ bot_id: bot.botId, ...c })), { onConflict: "bot_id,name" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ commands: await listCommands(bot.botId) });
}

export async function POST(request: NextRequest) {
  const g = await gate(request, "write");
  if ("error" in g) return g.error;
  const parsed = normalizeCommand(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { bot, service } = g;
  const { count } = await service.from("bot_commands").select("id", { count: "exact", head: true }).eq("bot_id", bot.botId);
  const { data: existing } = await service.from("bot_commands").select("id").eq("bot_id", bot.botId).eq("name", parsed.value.name).maybeSingle();
  if (!existing && (count ?? 0) >= 100) {
    return NextResponse.json({ error: "A bot can have at most 100 commands." }, { status: 400 });
  }
  const { data, error } = await service
    .from("bot_commands")
    .upsert({ bot_id: bot.botId, ...parsed.value }, { onConflict: "bot_id,name" })
    .select("id, name, description, options, created_at, updated_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ command: data }, { status: existing ? 200 : 201 });
}

export async function DELETE(request: NextRequest) {
  const g = await gate(request, "write");
  if ("error" in g) return g.error;
  const name = request.nextUrl.searchParams.get("name")?.toLowerCase() ?? "";
  if (!name) return NextResponse.json({ error: "Pass ?name= the command to delete." }, { status: 400 });
  const { data, error } = await g.service
    .from("bot_commands")
    .delete()
    .eq("bot_id", g.bot.botId)
    .eq("name", name)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "Command not found" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}

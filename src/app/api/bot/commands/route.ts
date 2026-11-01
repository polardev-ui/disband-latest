import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/server-auth";

/** Developer portal: delete one of your bot's slash commands. Bots register them with PUT /api/v1/commands. */
export async function DELETE(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const service = getServiceSupabase();
  if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

  const botId = request.nextUrl.searchParams.get("botId") ?? "";
  const name = request.nextUrl.searchParams.get("name") ?? "";
  const { data: bot } = await service.from("bots").select("id").eq("id", botId).eq("owner_id", user.id).maybeSingle();
  if (!bot) return NextResponse.json({ error: "Bot not found or not owned by you." }, { status: 404 });

  const { error } = await service.from("bot_commands").delete().eq("bot_id", botId).eq("name", name);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

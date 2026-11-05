import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/server-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { code } = await params;
    const body = await request.json().catch(() => ({})) as { serverId?: string };
    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    // A private bot can only be added by its developer.
    const { data: invite } = await service.from("bot_invites").select("bot_id").eq("code", code).maybeSingle();
    if (invite) {
      const { data: bot } = await service.from("bots").select("owner_id, is_public").eq("id", invite.bot_id).maybeSingle();
      if (bot && !bot.is_public && bot.owner_id !== user.id) {
        return NextResponse.json({ error: "This bot is private. Only its developer can add it to a space." }, { status: 403 });
      }
    }

    const { error } = await service.rpc("bot_approve_invite", {
      p_code: code,
      p_actor_id: user.id,
      p_server_id: body.serverId ?? null,
    });

    if (error) {
      if (/Only the server owner|channel manager/.test(error.message)) {
        return NextResponse.json({ error: "You need Manage Channels permission on that space to approve this bot." }, { status: 403 });
      }
      if (/not found|already been used|expired|revoked|A server must be chosen/.test(error.message)) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("bot/invites/[code]/approve error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}

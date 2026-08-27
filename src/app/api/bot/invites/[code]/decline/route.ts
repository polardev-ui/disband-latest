import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/server-auth";

// POST /api/bot/invites/[code]/decline — the server owner turns the bot away.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { code } = await params;
    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const { error } = await service.rpc("bot_decline_invite", {
      p_code: code,
      p_actor_id: user.id,
    });

    if (error) {
      if (/Only the server owner/.test(error.message)) {
        return NextResponse.json({ error: "Only the server owner can decline a bot invite." }, { status: 403 });
      }
      if (/not found/.test(error.message)) {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("bot/invites/[code]/decline error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

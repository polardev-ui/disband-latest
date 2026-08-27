import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";

// GET /api/bot/invites/[code] — public invite details shown on the approval
// page. Contains the bot identity, requested scopes, and server name.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;
    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const { data, error } = await service.rpc("bot_invite_info", { p_code: code });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Invite not found." }, { status: 404 });

    return NextResponse.json(data);
  } catch (err) {
    console.error("bot/invites/[code] GET error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

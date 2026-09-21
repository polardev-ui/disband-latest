import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getClientIp } from "@/lib/request-ip";
import { checkBotRateLimit, botRateLimited } from "@/lib/bot-gateway-guard";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;
    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    // Unauthenticated lookup: per-IP cap so code enumeration cannot burn
    // the shared anon throttle inside bot_invite_info for everyone.
    const lookupIp = getClientIp(request) || "unknown";
    const gate = await checkBotRateLimit(service, "invite", `lookup:${lookupIp}`);
    if (gate.limited) return botRateLimited(gate.retryAfterSeconds);

    const { data, error } = await service.rpc("bot_invite_info", { p_code: code });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Invite not found." }, { status: 404 });

    return NextResponse.json(data);
  } catch (err) {
    console.error("bot/invites/[code] GET error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}

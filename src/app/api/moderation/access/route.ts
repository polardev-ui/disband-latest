import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getClientIp } from "@/lib/request-ip";
import { isVpnOrProxy } from "@/lib/vpn-check";
import { getUserFromRequest } from "@/lib/server-auth";

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ banned: false });
  }

  const service = getServiceSupabase();
  if (!service) {
    return NextResponse.json({ banned: false });
  }

  const { data: ban } = await service
    .from("platform_bans")
    .select("reason, created_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!ban) {
    return NextResponse.json({ banned: false });
  }

  const ip = getClientIp(request);
  let vpnBlocked = false;
  if (ip && process.env.ENFORCE_ANTI_VPN_FOR_BANS !== "false") {
    vpnBlocked = await isVpnOrProxy(ip);
  }

  return NextResponse.json({
    banned: true,
    reason: ban.reason ?? "You have been banned from Disband.",
    bannedAt: ban.created_at,
    vpnBlocked,
  });
}

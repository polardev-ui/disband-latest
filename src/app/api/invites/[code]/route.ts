import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/request-ip";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getServiceSupabase } from "@/lib/supabase/server";

// GET /api/invites/[code] — public server-invite preview shown before
// signing up. Proxied through the service role (instead of an anonymous RPC)
// and throttled per IP so a spammer can't grind the database with anon calls.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const ip = getClientIp(request) || "unknown";
  const limit = rateLimit(`invite:${ip}`, 30, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const { code } = await params;
  const service = getServiceSupabase();
  if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

  const { data, error } = await service.rpc("get_server_by_invite", { p_code: code });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const rows = (data ?? []) as Record<string, unknown>[];
  if (!rows[0]) return NextResponse.json({ error: "Invite not found." }, { status: 404 });

  return NextResponse.json(rows[0]);
}
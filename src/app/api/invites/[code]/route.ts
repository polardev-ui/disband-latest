import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/request-ip";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getServiceSupabase } from "@/lib/supabase/server";

const CODE_RE = /^[a-zA-Z0-9-]{3,32}$/;
const SERVER_COLUMNS = "id, name, description, icon_url, banner_url, invite_code, verified, partner";

/*
 Invite card lookup. This used to call get_server_by_invite with the service
 key. That function rate-limits per signed-in user, and a service call has no
 user, so every invite card on Disband shared one 15-a-minute bucket: once it
 ran out, cards everywhere came back empty. The same lookup is done here,
 limited per IP instead.
*/
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const ip = getClientIp(request) || "unknown";
  const limit = rateLimit(`invite:${ip}`, 60, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const { code } = await params;
  if (!CODE_RE.test(code ?? "")) return NextResponse.json({ error: "Invite not found." }, { status: 404 });

  const service = getServiceSupabase();
  if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

  // The invite code itself, then a vanity code (any case), then an old code
  // kept as an alias. CODE_RE rules out LIKE wildcards in the vanity match.
  let { data: server, error } = await service.from("servers").select(SERVER_COLUMNS).eq("invite_code", code).maybeSingle();
  if (!server && !error) {
    ({ data: server, error } = await service.from("servers").select(SERVER_COLUMNS).ilike("vanity_code", code).limit(1).maybeSingle());
  }
  if (!server && !error) {
    const { data: alias } = await service.from("server_invite_aliases").select("server_id").eq("code", code).maybeSingle();
    if (alias?.server_id) {
      ({ data: server, error } = await service.from("servers").select(SERVER_COLUMNS).eq("id", alias.server_id).maybeSingle());
    }
  }
  if (error) return NextResponse.json({ error: "Couldn't load this invite." }, { status: 500 });
  if (!server) return NextResponse.json({ error: "Invite not found." }, { status: 404 });

  const { count } = await service
    .from("server_members")
    .select("user_id", { count: "exact", head: true })
    .eq("server_id", server.id);

  return NextResponse.json({ ...server, member_count: count ?? 0 });
}

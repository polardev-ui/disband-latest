import { NextResponse } from "next/server";
import { getClientIp } from "@/lib/request-ip";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getServiceSupabase } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const ip = getClientIp(request) || "unknown";
  const limit = rateLimit(`check-username:${ip}`, 40, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const url = new URL(request.url);
  const username = url.searchParams.get("username")?.trim() ?? "";

  // Proxied through the service role rather than the anon key: the RPC is no
  // longer granted to `anon` (see 0053), so anonymous callers of this route
  // must be served server-side instead.
  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json({ available: false, reason: "Service unavailable" }, { status: 503 });
  }

  const { data, error } = await supabase.rpc("check_username_available", { p_username: username });
  if (error) {
    return NextResponse.json({ available: false, reason: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}
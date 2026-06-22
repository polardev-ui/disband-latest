import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getClientIp } from "@/lib/request-ip";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const ip = getClientIp(request) || "unknown";
  const limit = rateLimit(`check-username:${ip}`, 40, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const url = new URL(request.url);
  const username = url.searchParams.get("username")?.trim() ?? "";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ available: false, reason: "Service unavailable" }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  });

  const { data, error } = await supabase.rpc("check_username_available", { p_username: username });
  if (error) {
    return NextResponse.json({ available: false, reason: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/server-auth";

// GET /api/bot/list — the caller's bots (developer authenticated).
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const { data: bots, error } = await service
      .from("bots")
      .select("id, user_id, name, avatar_url, scopes, token_prefix, revoked_at, created_at, last_seen_at")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ bots: bots ?? [] });
  } catch (err) {
    console.error("bot/list error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

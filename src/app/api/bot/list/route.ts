import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getUserFromRequest } from "@/lib/server-auth";

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Service not available" }, { status: 500 });

    const { data: bots, error } = await service
      .from("bots")
      .select("id, user_id, name, avatar_url, scopes, token_prefix, revoked_at, created_at, last_seen_at, description, tags, terms_url, privacy_url, is_public")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // How many spaces each bot is in, for the portal.
    const ids = (bots ?? []).map((b) => b.id);
    const counts: Record<string, number> = {};
    if (ids.length) {
      const { data: grants } = await service.from("bot_grants").select("bot_id").in("bot_id", ids);
      for (const g of grants ?? []) counts[g.bot_id] = (counts[g.bot_id] ?? 0) + 1;
    }

    return NextResponse.json({ bots: (bots ?? []).map((b) => ({ ...b, space_count: counts[b.id] ?? 0 })) });
  } catch (err) {
    console.error("bot/list error", err);
    return NextResponse.json({ error: "Internal space error" }, { status: 500 });
  }
}

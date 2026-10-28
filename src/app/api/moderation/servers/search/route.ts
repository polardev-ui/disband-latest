import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getUserFromRequest, requireSupportStaff } from "@/lib/server-auth";

export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request as import("next/server").NextRequest);
    if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    const isStaff = await requireSupportStaff(user.id);
    if (!isStaff) return NextResponse.json({ error: "Insufficient permissions." }, { status: 403 });

    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Moderation service unavailable." }, { status: 503 });

    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim() ?? "";

    let query = service
      .from("servers")
      .select("id, name, owner_id, icon_url, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (q) {
      // Try UUID match first, otherwise name ilike.
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q);
      if (isUuid) query = query.eq("id", q);
      else query = query.ilike("name", `%${q}%`);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Attach member counts.
    const serverIds = (data ?? []).map((s: any) => s.id);
    const counts: Record<string, number> = {};
    if (serverIds.length) {
      const { data: mc } = await service
        .from("server_members")
        .select("server_id")
        .in("server_id", serverIds);
      for (const row of mc ?? []) {
        counts[row.server_id] = (counts[row.server_id] ?? 0) + 1;
      }
    }

    const items = (data ?? []).map((s: any) => ({ ...s, member_count: counts[s.id] ?? 0 }));
    return NextResponse.json({ servers: items });
  } catch (err) {
    console.error("servers search error", err);
    return NextResponse.json({ error: "Moderation service failed. Try again." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getUserFromRequest, requireSupportStaff } from "@/lib/server-auth";

// Sentinel's rule matches and Tether's decision on each one. `resolution`
// holds Tether's verdict and reasoning.
export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request as import("next/server").NextRequest);
    if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const isStaff = await requireSupportStaff(user.id);
    if (!isStaff) return NextResponse.json({ error: "Insufficient permissions." }, { status: 403 });

    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Moderation service unavailable." }, { status: 503 });

    const { data, error } = await service
      .from("content_flags")
      .select("id, src_table, src_column, src_id, owner_id, category, severity, rule_id, state, resolution, created_at, resolved_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ flags: data ?? [] });
  } catch (err) {
    console.error("content-flags GET error", err);
    return NextResponse.json({ error: "Moderation service failed. Try again." }, { status: 500 });
  }
}

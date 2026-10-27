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
    const status = url.searchParams.get("status") ?? "pending";
    const q = url.searchParams.get("q")?.trim() ?? "";

    let query = service
      .from("message_reports")
      .select("id, reporter_id, target_type, target_surface, target_table, target_id, container_id, reported_user_id, reason, details, status, decision, action, snapshot, created_at, reviewed_at, reporter:profiles!message_reports_reporter_id_fkey(username, display_name), reported:profiles!message_reports_reported_user_id_fkey(username, display_name)")
      .order("created_at", { ascending: false })
      .limit(100);

    if (status !== "all") query = query.eq("status", status);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    let items = data ?? [];
    if (q) {
      const lower = q.toLowerCase();
      items = items.filter((r: any) =>
        (r.reporter?.username ?? "").toLowerCase().includes(lower) ||
        (r.reported?.username ?? "").toLowerCase().includes(lower) ||
        (r.reason ?? "").toLowerCase().includes(lower)
      );
    }

    return NextResponse.json({ reports: items });
  } catch (err) {
    console.error("message-reports GET error", err);
    return NextResponse.json({ error: "Moderation service failed. Try again." }, { status: 500 });
  }
}

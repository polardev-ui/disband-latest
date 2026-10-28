import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getUserFromRequest, requireSupportStaff } from "@/lib/server-auth";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getUserFromRequest(request as import("next/server").NextRequest);
    if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    const isStaff = await requireSupportStaff(user.id);
    if (!isStaff) return NextResponse.json({ error: "Insufficient permissions." }, { status: 403 });

    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Moderation service unavailable." }, { status: 503 });

    const url = new URL(request.url);
    const userId = url.searchParams.get("userId")?.trim() ?? "";
    const q = url.searchParams.get("q")?.trim() ?? "";

    let query = service
      .from("audit_log")
      .select("id, server_id, actor_id, action, target_type, target_id, details, created_at, actor:profiles!audit_log_actor_id_fkey(username, display_name)")
      .eq("server_id", id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (userId) query = query.eq("actor_id", userId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    let items = data ?? [];
    if (q) {
      const lower = q.toLowerCase();
      items = items.filter((r: any) =>
        (r.action ?? "").toLowerCase().includes(lower) ||
        (r.target_type ?? "").toLowerCase().includes(lower) ||
        (r.target_id ?? "").toLowerCase().includes(lower) ||
        JSON.stringify(r.details ?? {}).toLowerCase().includes(lower)
      );
    }

    return NextResponse.json({ entries: items });
  } catch (err) {
    console.error("server audit error", err);
    return NextResponse.json({ error: "Moderation service failed. Try again." }, { status: 500 });
  }
}

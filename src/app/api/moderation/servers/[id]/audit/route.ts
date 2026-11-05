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
      .select("id, server_id, actor_id, action, target_type, target_id, details, created_at")
      .eq("server_id", id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (userId) query = query.eq("actor_id", userId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // audit_log has no foreign key to profiles, so the actors are looked up
    // separately rather than embedded.
    const actorIds = [...new Set((data ?? []).map((r) => r.actor_id).filter((v): v is string => !!v))];
    const actors = new Map<string, { username: string | null; display_name: string | null }>();
    if (actorIds.length) {
      const { data: people } = await service.from("profiles").select("id, username, display_name").in("id", actorIds);
      for (const p of people ?? []) actors.set(p.id, { username: p.username, display_name: p.display_name });
    }
    let items = (data ?? []).map((r) => ({ ...r, actor: r.actor_id ? actors.get(r.actor_id) ?? null : null }));
    if (q) {
      const lower = q.toLowerCase();
      items = items.filter((r) =>
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

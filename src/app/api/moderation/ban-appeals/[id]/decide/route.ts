import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getUserFromRequest, requireSupportStaff } from "@/lib/server-auth";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getUserFromRequest(request as import("next/server").NextRequest);
    if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const isStaff = await requireSupportStaff(user.id);
    if (!isStaff) return NextResponse.json({ error: "Insufficient permissions." }, { status: 403 });

    const service = getServiceSupabase();
    if (!service) return NextResponse.json({ error: "Moderation service unavailable." }, { status: 503 });

    let body: { decision?: string; approve?: boolean };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const approve = body.approve === true;
    const newStatus = approve ? "approved" : "denied";

    // Fetch appeal to get user_id
    const { data: appeal } = await service
      .from("ban_appeals")
      .select("user_id")
      .eq("id", id)
      .maybeSingle();
    if (!appeal) return NextResponse.json({ error: "Appeal not found." }, { status: 404 });

    // If approved, unban
    if (approve) {
      await service.from("platform_bans").delete().eq("user_id", appeal.user_id);
    }

    const { error } = await service
      .from("ban_appeals")
      .update({
        status: newStatus,
        decision: body.decision?.trim() || null,
        reviewer_id: user.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: newStatus });
  } catch (err) {
    console.error("ban-appeals decide error", err);
    return NextResponse.json({ error: "Moderation service failed. Try again." }, { status: 500 });
  }
}

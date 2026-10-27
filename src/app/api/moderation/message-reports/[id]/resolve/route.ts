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

    let body: { action?: string; decision?: string };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const action = body.action === "dismiss" ? "dismissed" : "actioned";
    const status = action;

    const { error } = await service
      .from("message_reports")
      .update({
        status,
        action: body.action ?? "reviewed",
        decision: body.decision?.trim() || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("message-reports resolve error", err);
    return NextResponse.json({ error: "Moderation service failed. Try again." }, { status: 500 });
  }
}

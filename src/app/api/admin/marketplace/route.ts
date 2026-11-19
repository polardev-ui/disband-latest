import { NextResponse } from "next/server";
import { getRouteUser, getServiceSupabase } from "@/lib/supabase/server";
import { requireSupportStaff } from "@/lib/server-auth";

/*
 Staff queue for the bot marketplace: bots waiting for review (Tether runs
 daily, staff can decide sooner) and reported reviews Tether passed on.
*/

async function staffOnly(req: Request) {
  const user = await getRouteUser(req);
  if (!user) return { error: NextResponse.json({ error: "Sign in first." }, { status: 401 }) };
  if (!(await requireSupportStaff(user.id))) return { error: NextResponse.json({ error: "Staff only." }, { status: 403 }) };
  const service = getServiceSupabase();
  if (!service) return { error: NextResponse.json({ error: "Unavailable." }, { status: 503 }) };
  return { user, service };
}

export async function GET(req: Request) {
  const gate = await staffOnly(req);
  if ("error" in gate) return gate.error;
  const { service } = gate;
  const { data: listings } = await service
    .from("bot_listings")
    .select("bot_id, description, status, submitted_at, review_note, bots!inner(name, avatar_url, owner_id)")
    .eq("status", "pending")
    .order("submitted_at")
    .limit(100);
  const { data: reports } = await service
    .from("bot_review_reports")
    .select("id, reason, details, status, decision_note, created_at, bot_reviews!inner(id, rating, body, bot_id, bots!inner(name))")
    .in("status", ["open", "needs_staff"])
    .order("created_at")
    .limit(100);
  return NextResponse.json({ listings: listings ?? [], reports: reports ?? [] });
}

export async function POST(req: Request) {
  const gate = await staffOnly(req);
  if ("error" in gate) return gate.error;
  const { service } = gate;
  const body = (await req.json().catch(() => null)) as { kind?: string; id?: string; decision?: string; note?: string } | null;
  const now = new Date().toISOString();
  const note = (body?.note ?? "").toString().slice(0, 400) || null;
  if (body?.kind === "listing" && body.id && (body.decision === "approve" || body.decision === "reject")) {
    const approved = body.decision === "approve";
    const { error } = await service.from("bot_listings").update({
      status: approved ? "approved" : "rejected",
      review_note: note ?? (approved ? "Approved by staff." : "Rejected by staff."),
      reviewed_by: "staff",
      reviewed_at: now,
      ...(approved ? { approved_at: now } : {}),
      updated_at: now,
    }).eq("bot_id", body.id);
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
  }
  if (body?.kind === "report" && body.id && (body.decision === "uphold" || body.decision === "dismiss")) {
    const { data: report } = await service.from("bot_review_reports").select("review_id").eq("id", body.id).maybeSingle();
    if (!report) return NextResponse.json({ error: "Report not found." }, { status: 404 });
    if (body.decision === "uphold") await service.from("bot_reviews").update({ hidden_at: now }).eq("id", report.review_id);
    await service.from("bot_review_reports").update({
      status: body.decision === "uphold" ? "upheld" : "dismissed",
      decided_by: "staff",
      decision_note: note,
      decided_at: now,
    }).eq("id", body.id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Invalid request." }, { status: 400 });
}

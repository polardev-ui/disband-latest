import { NextResponse } from "next/server";
import { getRouteUser, getServiceSupabase } from "@/lib/supabase/server";
import { requireSupportStaff } from "@/lib/server-auth";
import { reviewNow } from "@/lib/bot-marketplace.server";

export const maxDuration = 120;

/*
 Staff queue for the bot marketplace, used by Team Support and the
 marketplace's own Staff queue button.

   GET   waiting bots and reported reviews (with Tether's verdict so far), and
         the most recent decisions
   POST  { kind, id, decision }      staff decides
         { kind, id, action: "review-now" }  Tether reviews it right now
*/

async function staffOnly(req: Request) {
  const user = await getRouteUser(req);
  if (!user) return { error: NextResponse.json({ error: "Sign in first." }, { status: 401 }) };
  if (!(await requireSupportStaff(user.id))) return { error: NextResponse.json({ error: "Staff only." }, { status: 403 }) };
  const service = getServiceSupabase();
  if (!service) return { error: NextResponse.json({ error: "Unavailable." }, { status: 503 }) };
  return { user, service };
}

const LISTING_FIELDS =
  "bot_id, display_name, tagline, category, tags, description, website_url, support_url, privacy_url, terms_url, official, status, " +
  "submitted_at, reviewed_at, reviewed_by, review_note, tether_decision, tether_reason, tether_reviewed_at, needs_human, priority_requested_at, " +
  "bots!inner(name, avatar_url, owner_id, authorization_count, profiles:owner_id(username, display_name))";

const REPORT_FIELDS =
  "id, reason, details, status, decided_by, decision_note, decided_at, created_at, tether_decision, tether_reason, tether_reviewed_at, priority_requested_at, " +
  "bot_reviews!inner(id, rating, body, created_at, hidden_at, bot_id, bots!inner(name, avatar_url))";

export async function GET(req: Request) {
  const gate = await staffOnly(req);
  if ("error" in gate) return gate.error;
  const { service } = gate;

  const [waiting, decided, openReports, decidedReports] = await Promise.all([
    service.from("bot_listings").select(LISTING_FIELDS).eq("status", "pending")
      .order("priority_requested_at", { ascending: false, nullsFirst: false }).order("submitted_at").limit(100),
    service.from("bot_listings").select(LISTING_FIELDS).neq("status", "pending").eq("official", false)
      .order("reviewed_at", { ascending: false, nullsFirst: false }).limit(40),
    service.from("bot_review_reports").select(REPORT_FIELDS).in("status", ["open", "needs_staff"])
      .order("priority_requested_at", { ascending: false, nullsFirst: false }).order("created_at").limit(100),
    service.from("bot_review_reports").select(REPORT_FIELDS).in("status", ["upheld", "dismissed"])
      .order("decided_at", { ascending: false, nullsFirst: false }).limit(40),
  ]);
  return NextResponse.json({
    listings: waiting.data ?? [],
    decidedListings: decided.data ?? [],
    reports: openReports.data ?? [],
    decidedReports: decidedReports.data ?? [],
  });
}

export async function POST(req: Request) {
  const gate = await staffOnly(req);
  if ("error" in gate) return gate.error;
  const { service } = gate;
  const body = (await req.json().catch(() => null)) as { kind?: string; id?: string; decision?: string; note?: string; action?: string } | null;
  const now = new Date().toISOString();
  const note = (body?.note ?? "").toString().slice(0, 400) || null;

  if (body?.action === "review-now" && body.id && (body.kind === "listing" || body.kind === "report")) {
    try {
      const outcome = await reviewNow(body.kind, body.id);
      return NextResponse.json({ ok: true, outcome });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Tether couldn't review it." }, { status: 502 });
    }
  }

  if (body?.kind === "listing" && body.id && (body.decision === "approve" || body.decision === "reject")) {
    const approved = body.decision === "approve";
    const { error } = await service.from("bot_listings").update({
      status: approved ? "approved" : "rejected",
      review_note: note ?? (approved ? "Approved by staff." : "Rejected by staff."),
      reviewed_by: "staff",
      reviewed_at: now,
      needs_human: false,
      priority_requested_at: null,
      ...(approved ? { approved_at: now } : {}),
      updated_at: now,
    }).eq("bot_id", body.id);
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
  }

  if (body?.kind === "report" && body.id && (body.decision === "uphold" || body.decision === "dismiss")) {
    const { data: report } = await service.from("bot_review_reports").select("review_id").eq("id", body.id).maybeSingle();
    if (!report) return NextResponse.json({ error: "Report not found." }, { status: 404 });
    if (body.decision === "uphold") await service.from("bot_reviews").update({ hidden_at: now }).eq("id", report.review_id);
    else await service.from("bot_reviews").update({ hidden_at: null }).eq("id", report.review_id);
    await service.from("bot_review_reports").update({
      status: body.decision === "uphold" ? "upheld" : "dismissed",
      decided_by: "staff",
      decision_note: note,
      decided_at: now,
      priority_requested_at: null,
    }).eq("id", body.id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid request." }, { status: 400 });
}

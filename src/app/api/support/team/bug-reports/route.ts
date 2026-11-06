import { NextResponse } from "next/server";
import { requireSupportStaff } from "@/lib/server-auth";
import { getRouteUser, getServiceSupabase } from "@/lib/supabase/server";
import { sendBroadcast } from "@/lib/disband-official";

const STATUSES = ["open", "resolved", "dismissed"] as const;
type Status = (typeof STATUSES)[number];

async function staffOnly(req: Request) {
  const user = await getRouteUser(req);
  if (!user) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const service = getServiceSupabase();
  if (!service) return { error: NextResponse.json({ error: "Unavailable" }, { status: 503 }) };
  if (!(await requireSupportStaff(user.id))) return { error: NextResponse.json({ error: "Access denied." }, { status: 403 }) };
  return { user, service };
}

/** Bug reports for the team support page, newest first, with counts per status. */
export async function GET(req: Request) {
  const auth = await staffOnly(req);
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const url = new URL(req.url);
  const raw = url.searchParams.get("status") ?? "open";
  const status = (STATUSES as readonly string[]).includes(raw) ? (raw as Status) : "open";

  const [{ data, error }, ...counts] = await Promise.all([
    service
      .from("bug_reports")
      .select("id, reporter_user_id, reporter_email, reporter_name, title, description, steps, attachments, status, resolved_at, resolved_by, created_at")
      .eq("status", status)
      .order("created_at", { ascending: false })
      .limit(200),
    ...STATUSES.map((s) => service.from("bug_reports").select("id", { count: "exact", head: true }).eq("status", s)),
  ]);
  if (error) return NextResponse.json({ error: "Couldn't load bug reports." }, { status: 500 });

  const reports = (data ?? []) as Array<{ reporter_user_id: string | null } & Record<string, unknown>>;
  const ids = [...new Set(reports.map((r) => r.reporter_user_id).filter((id): id is string => !!id))];
  const { data: profiles } = ids.length
    ? await service.from("profiles").select("id, username, display_name, avatar_url").in("id", ids)
    : { data: [] };
  const byId = new Map(((profiles ?? []) as Array<{ id: string }>).map((p) => [p.id, p]));

  return NextResponse.json({
    reports: reports.map((r) => ({ ...r, profile: r.reporter_user_id ? byId.get(r.reporter_user_id) ?? null : null })),
    counts: Object.fromEntries(STATUSES.map((s, i) => [s, counts[i].count ?? 0])),
  });
}

/**
 * Mark a report resolved, dismissed or open again. Resolving tells the
 * reporter, from @disband in the app and by email, that it's fixed.
 */
export async function PATCH(req: Request) {
  const auth = await staffOnly(req);
  if ("error" in auth) return auth.error;
  const { user, service } = auth;

  let body: { id?: unknown; status?: unknown; note?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  const status = typeof body.status === "string" && (STATUSES as readonly string[]).includes(body.status) ? (body.status as Status) : null;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";
  if (!id || !status) return NextResponse.json({ error: "Choose a report and a status." }, { status: 400 });

  const { data: before } = await service.from("bug_reports").select("status, title, reporter_user_id").eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ error: "Report not found." }, { status: 404 });

  const closing = status !== "open";
  const { error } = await service
    .from("bug_reports")
    .update({
      status,
      resolved_at: closing ? new Date().toISOString() : null,
      resolved_by: closing ? user.id : null,
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: "Couldn't update the report." }, { status: 500 });

  let notified = false;
  if (status === "resolved" && before.status !== "resolved" && before.reporter_user_id) {
    try {
      await sendBroadcast({
        audience: "user",
        targetUserId: before.reporter_user_id,
        kind: "service_notice",
        title: "Your bug report was fixed",
        body: `Thanks for reporting "${String(before.title).slice(0, 120)}". We've fixed it.${note ? `\n\n${note}` : ""}`,
        sendEmail: true,
        actor: user.id,
      });
      notified = true;
    } catch (err) {
      console.error("[bug-reports] notify failed:", err);
    }
  }

  return NextResponse.json({ ok: true, notified });
}

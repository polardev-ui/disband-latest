import { NextResponse } from "next/server";
import { getRouteUser, getServiceSupabase } from "@/lib/supabase/server";
import { sendResendEmail } from "@/lib/resend";
import {
  BUG_REPORT_EMAIL,
  buildBugReportEmailHtml,
  validateBugReport,
  type BugReportAttachment,
  type BugReportInput,
} from "@/lib/bug-reports";

/*
 Bug reports (brought back 6 Nov 2026). The old form took anonymous reports
 with an in-memory limit and drew 3,200+ that couldn't be triaged, so it was
 retired. Now a report needs a signed-in account, limits are durable and per
 account (platform_rate_limit), and the same title twice in a day is refused.
*/
export async function POST(request: Request) {
  const user = await getRouteUser(request);
  if (!user) return NextResponse.json({ error: "Log in to report a bug." }, { status: 401 });

  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Bug reporting isn't available right now. Try again later." }, { status: 503 });
  }

  let body: Partial<BugReportInput> & { environment?: unknown };
  try {
    body = (await request.json()) as Partial<BugReportInput> & { environment?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, username")
    .eq("id", user.id)
    .maybeSingle();
  const p = profile as { display_name?: string | null; username?: string | null } | null;

  const environment = typeof body.environment === "string" ? body.environment.slice(0, 400) : "";
  const steps = body.steps?.trim() ?? "";
  const report: BugReportInput = {
    reporterName: p?.display_name || p?.username || null,
    reporterEmail: user.email?.toLowerCase() ?? null,
    reporterUserId: user.id,
    title: body.title?.trim() ?? "",
    description: body.description?.trim() ?? "",
    steps: environment ? `${steps}${steps ? "\n\n" : ""}Device: ${environment}` : steps,
    attachments: Array.isArray(body.attachments)
      ? (body.attachments as BugReportAttachment[]).slice(0, 6)
      : [],
  };

  const validationError = validateBugReport(report);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  // Durable limits: 3 an hour, 10 a day per account.
  for (const [key, max, windowSeconds] of [
    [`bug-report:h:${user.id}`, 3, 3600],
    [`bug-report:d:${user.id}`, 10, 86400],
  ] as const) {
    const { error } = await supabase.rpc("platform_rate_limit", { p_key: key, p_max: max, p_window_seconds: windowSeconds });
    if (error) {
      return NextResponse.json(
        { error: "You've sent a lot of reports recently. Try again later." },
        { status: 429 },
      );
    }
  }

  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: duplicate } = await supabase
    .from("bug_reports")
    .select("id")
    .eq("reporter_user_id", user.id)
    .ilike("title", report.title.replace(/[\\%_]/g, (c) => `\\${c}`))
    .gte("created_at", since)
    .limit(1)
    .maybeSingle();
  if (duplicate) {
    return NextResponse.json({ error: "You've already reported this today. We've got it." }, { status: 409 });
  }

  const { error: insertError } = await supabase.from("bug_reports").insert({
    reporter_user_id: report.reporterUserId,
    reporter_email: report.reporterEmail,
    reporter_name: report.reporterName,
    title: report.title,
    description: report.description,
    steps: report.steps,
    attachments: report.attachments,
  });
  if (insertError) {
    console.error("[bug-report] insert error:", insertError);
    return NextResponse.json({ error: "Couldn't save your report. Please try again in a moment." }, { status: 500 });
  }

  try {
    await sendResendEmail({
      to: BUG_REPORT_EMAIL,
      subject: `Bug report: ${report.title.slice(0, 80)}`,
      html: buildBugReportEmailHtml(report),
      from: process.env.RESEND_FROM_EMAIL_BUG ?? "Disband <onboarding@resend.dev>",
    });
  } catch (err) {
    console.error("[bug-report] email error:", err);
  }

  return NextResponse.json({ ok: true, message: "Bug report sent. Thanks!" });
}

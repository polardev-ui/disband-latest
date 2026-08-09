import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getServiceSupabase } from "@/lib/supabase/server";
import { PUBLIC_ENV } from "@/lib/public-env";
import { sendResendEmail } from "@/lib/resend";
import { getClientIp } from "@/lib/request-ip";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  BUG_REPORT_EMAIL,
  buildBugReportEmailHtml,
  validateBugReport,
  type BugReportAttachment,
  type BugReportInput,
} from "@/lib/bug-reports";

export async function POST(request: Request) {
  const ip = getClientIp(request) || "unknown";
  const limit = rateLimit(`bug-report:${ip}`, 3, 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  // Attach the signed-in user (if any) so the bounty badge can be granted.
  let userId: string | null = null;
  let userEmail: string | null = null;
  let userName: string | null = null;
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      PUBLIC_ENV.supabaseUrl,
      PUBLIC_ENV.supabaseAnonKey,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          },
        },
      },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
      userEmail = user.email ?? null;
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, username")
        .eq("id", user.id)
        .maybeSingle();
      userName =
        (profile as { display_name?: string | null; username?: string | null } | null)
          ?.display_name
        ?? (profile as { display_name?: string | null; username?: string | null } | null)
          ?.username
        ?? user.user_metadata?.full_name
        ?? null;
    }
  } catch {
    // Cookie/session read failed — fall through and treat as anonymous.
  }

  let body: Partial<BugReportInput>;
  try {
    body = (await request.json()) as Partial<BugReportInput>;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const report: BugReportInput = {
    reporterName: body.reporterName?.trim() || userName || null,
    reporterEmail: (body.reporterEmail?.trim() || userEmail || "").toLowerCase() || null,
    reporterUserId: userId,
    title: body.title?.trim() ?? "",
    description: body.description?.trim() ?? "",
    steps: body.steps?.trim() ?? "",
    attachments: Array.isArray(body.attachments)
      ? (body.attachments as BugReportAttachment[]).slice(0, 6)
      : [],
  };

  const validationError = validateBugReport(report);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }
  if (!report.reporterEmail) {
    return NextResponse.json(
      { error: "Enter an email so we can reach you about the report." },
      { status: 400 },
    );
  }

  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: "Bug reporting is not configured yet. Try again later." },
      { status: 503 },
    );
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
    return NextResponse.json(
      { error: "Could not save your report. Please try again in a moment." },
      { status: 500 },
    );
  }

  // Deliver to the bug inbox.
  try {
    await sendResendEmail({
      to: BUG_REPORT_EMAIL,
      subject: `🐛 Bug report: ${report.title.slice(0, 80)}`,
      html: buildBugReportEmailHtml(report),
      from: process.env.RESEND_FROM_EMAIL_BUG ?? "Disband <onboarding@resend.dev>",
    });
  } catch (err) {
    console.error("[bug-report] email error:", err);
    // The report is saved; failing to email shouldn't fail the whole request.
  }

  return NextResponse.json({
    ok: true,
    message: "Bug report submitted. If we fix it, you'll get the Bug Bounty Hunter badge.",
  });
}

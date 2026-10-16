import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { sendResendEmail } from "@/lib/resend";
import { PUBLIC_ENV } from "@/lib/public-env";

function redirectTo(state: string): NextResponse {
  const url = `${PUBLIC_ENV.webAppUrl.replace(/\/$/, "")}/email-change?state=${state}`;
  return NextResponse.redirect(url);
}

/**
 * Confirm one half of an email change.
 *   ?which=old&token=…  → marks the old address confirmed, mails the new one.
 *   ?which=new&token=…  → applies the change in auth, shows "completed".
 * The email links land here server-side (never in the client bundle), then
 * redirect to the public status page.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token") ?? "";
  const which = searchParams.get("which") ?? "";
  if (!token || (which !== "old" && which !== "new")) {
    return redirectTo("invalid");
  }

  const service = getServiceSupabase();
  if (!service) return redirectTo("invalid");

  const column = which === "old" ? "token_old" : "token_new";
  const { data: row } = await service
    .from("email_change_requests")
    .select("*")
    .eq(column, token)
    .is("completed_at", null)
    .maybeSingle();

  if (!row) return redirectTo("invalid");
  if (new Date(row.expires_at).getTime() < Date.now()) return redirectTo("expired");

  if (which === "old") {
    if (row.old_confirmed_at) return redirectTo("old-confirmed");
    const { error } = await service
      .from("email_change_requests")
      .update({ old_confirmed_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) return redirectTo("invalid");

    const confirmUrl = `${PUBLIC_ENV.webAppUrl.replace(/\/$/, "")}/email-change/confirm?token=${row.token_new}&which=new`;
    await sendResendEmail({
      to: row.new_email,
      subject: "Confirm your new Disband email",
      html: `
        <div style="font-family:system-ui,sans-serif;background:#0b0c0e;color:#e7e9ea;padding:32px">
          <h2 style="margin:0 0 12px">Confirm your new email</h2>
          <p style="margin:0 0 16px;color:#b5bac1">
            This address was set as the new email for a Disband account. Confirm it to finish the change.
          </p>
          <a href="${confirmUrl}" style="display:inline-block;background:#5865f2;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600">
            Confirm this email
          </a>
          <p style="margin:24px 0 0;color:#80848e;font-size:12px">
            If you didn't request this, ignore it — the change won't complete without this step. The link expires in 24 hours.
          </p>
        </div>
      `,
    });
    return redirectTo("old-confirmed");
  }

  // which === "new": the old address must have confirmed first.
  if (!row.old_confirmed_at) return redirectTo("invalid");

  const { error: updateError } = await service.auth.admin.updateUserById(row.user_id, {
    email: row.new_email,
    email_confirm: true,
  });
  if (updateError) return redirectTo("taken");

  await service
    .from("email_change_requests")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", row.id);
  return redirectTo("completed");
}

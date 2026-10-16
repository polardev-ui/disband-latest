import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/server-auth";
import { getServiceSupabase } from "@/lib/supabase/server";
import { sendResendEmail } from "@/lib/resend";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { PUBLIC_ENV } from "@/lib/public-env";

/**
 * Start an email change. Both addresses must confirm: a link goes to the
 * CURRENT email first (proves the account wasn't hijacked); once clicked, a
 * link goes to the NEW email; once that is clicked the change is applied.
 */
export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest(request as import("next/server").NextRequest);
    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }
    const currentEmail = user.email;
    if (!currentEmail) {
      return NextResponse.json({ error: "This account has no email to change." }, { status: 400 });
    }

    const ip = getClientIp(request) || "unknown";
    const limit = rateLimit(`email-change:user:${user.id}:${ip}`, 5, 10 * 60_000);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

    let body: { newEmail?: string };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    const newEmail = (body.newEmail ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (newEmail === currentEmail.toLowerCase()) {
      return NextResponse.json({ error: "That is already your email." }, { status: 400 });
    }

    const service = getServiceSupabase();
    if (!service) {
      return NextResponse.json({ error: "Server is not configured for email changes." }, { status: 503 });
    }

    // One open request per user: drop any earlier unfinished ones.
    await service.from("email_change_requests").delete().eq("user_id", user.id).is("completed_at", null);

    const tokenOld = randomBytes(24).toString("base64url");
    const tokenNew = randomBytes(24).toString("base64url");
    const { error } = await service.from("email_change_requests").insert({
      user_id: user.id,
      new_email: newEmail,
      token_old: tokenOld,
      token_new: tokenNew,
    });
    if (error) {
      return NextResponse.json({ error: "Could not start the email change." }, { status: 500 });
    }

    const confirmUrl = `${PUBLIC_ENV.webAppUrl.replace(/\/$/, "")}/email-change/confirm?token=${tokenOld}&which=old`;
    await sendResendEmail({
      to: currentEmail,
      subject: "Confirm your Disband email change",
      html: `
        <div style="font-family:system-ui,sans-serif;background:#0b0c0e;color:#e7e9ea;padding:32px">
          <h2 style="margin:0 0 12px">Confirm your email change</h2>
          <p style="margin:0 0 16px;color:#b5bac1">
            Someone (hopefully you) asked to change the email on this Disband account to
            <strong style="color:#e7e9ea">${newEmail}</strong>.
          </p>
          <p style="margin:0 0 16px;color:#b5bac1">
            If that was you, confirm it here. We'll then send a final confirmation link to the new address.
          </p>
          <a href="${confirmUrl}" style="display:inline-block;background:#5865f2;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600">
            Approve email change
          </a>
          <p style="margin:24px 0 0;color:#80848e;font-size:12px">
            If this wasn't you, ignore this email — your account stays on this address. The link expires in 24 hours.
          </p>
        </div>
      `,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not start the email change." }, { status: 500 });
  }
}

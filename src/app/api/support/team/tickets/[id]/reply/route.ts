import { requireSupportStaff } from "@/lib/server-auth";
import { NextResponse } from "next/server";
import { getRouteUser, getServiceSupabase } from "@/lib/supabase/server";

import { sendResendEmail } from "@/lib/resend";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildReplyHtml(subject: string, reply: string, supportUrl: string) {
  return `
    <div style="font-family:Inter,system-ui,sans-serif;line-height:1.6;max-width:640px">
      <h1 style="margin:0 0 12px;font-size:24px;color:#111;">Reply from Disband Support</h1>
      <p style="margin:0 0 16px;">A member of our human support team replied to your request.</p>
      <div style="background:#f6f7f9;padding:16px;border-radius:12px;margin:16px 0;">
        <strong>Subject:</strong> ${escapeHtml(subject)}<br />
        <strong>Reply:</strong><br />
        ${escapeHtml(reply).replace(/\n/g, "<br />")}
      </div>
      <p style="margin:0 0 16px;color:#555;font-size:14px;">
        Human-review requests are usually handled within up to 48 hours.
      </p>
      <p style="margin:16px 0;">
        <a href="${supportUrl}" style="display:inline-block;padding:10px 16px;background:#5865f2;color:#fff;border-radius:8px;text-decoration:none;">Open support</a>
      </p>
    </div>`;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Unavailable" }, { status: 500 });
  if (!(await requireSupportStaff(user.id))) return NextResponse.json({ error: "Access denied." }, { status: 403 });
  if (!supabase) return NextResponse.json({ error: "Unavailable" }, { status: 500 });

  const { id } = await params;
  const { content } = (await req.json().catch(() => ({}))) as { content?: unknown };
  const clean = typeof content === "string" ? content.trim().slice(0, 4000) : "";
  if (!clean) return NextResponse.json({ error: "Write a reply first." }, { status: 400 });

  const { data: ticket } = await supabase
    .from("support_tickets")
    .select("id, user_id, email, subject, status")
    .eq("id", id)
    .maybeSingle();
  if (!ticket) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });

  const { data: inserted, error } = await supabase
    .from("support_messages")
    .insert({ ticket_id: id, role: "staff", content: clean })
    .select("id")
    .single();
  if (error) {
    const pgError = error as { message?: string; details?: string };
    return NextResponse.json({ error: pgError.message || "Could not save reply." }, { status: 500 });
  }

  // A follow-up note on an already-resolved ticket keeps it resolved;
  // only active/reviewed requests move out of human review.
  await supabase
    .from("support_tickets")
    .update({
      status: ticket.status === "closed" ? "closed" : "human_reply",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  let emailSent = false;
  let emailError: string | null = null;
  const recipient = ticket.email;
  if (!recipient) {
    emailError = "No email address on the account.";
  } else {
    try {
      await sendResendEmail({
        to: recipient,
        subject: `Re: Disband support — ${ticket.subject}`,
        html: buildReplyHtml(ticket.subject, clean, `${process.env.APP_ORIGIN ?? "https://www.disband.dev"}/support`),
      });
      emailSent = true;
    } catch (err) {
      emailError = err instanceof Error ? err.message : "Email could not be sent.";
    }
  }

  return NextResponse.json({ id: inserted?.id, emailSent, emailError });
}

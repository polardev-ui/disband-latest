import { NextResponse } from "next/server";
import { getRouteUser, getServiceSupabase } from "@/lib/supabase/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { persistentRateLimitCheck } from "@/lib/auth-guard";
import { chatWithSupportTether } from "@/lib/tether-support";
import { DeepSeekError, DeepSeekUnavailableError } from "@/lib/deepseek";

export const maxDuration = 90;

/**
 * Support tickets. Authenticated session only — logged-out visitors verify
 * their Disband email (OTP) on /support first, so the session IS the
 * account holder by the time a row exists. user_id always comes from the
 * session, never the request body.
 */
export async function GET(req: Request) {
  const user = await getRouteUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Unavailable" }, { status: 500 });

  const { data, error } = await supabase
    .from("support_tickets")
    .select("id, subject, status, created_at, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: "Could not load tickets." }, { status: 500 });
  return NextResponse.json({ tickets: data ?? [] });
}

export async function POST(req: Request) {
  const user = await getRouteUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Unavailable" }, { status: 500 });

  const limit = rateLimit(`support:new:${user.id}`, 5, 3_600_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
  const hit = await persistentRateLimitCheck(supabase, [
    { key: `support:new:${user.id}`, max: 10, windowSeconds: 86_400 },
  ]);
  if (hit) return NextResponse.json({ error: "Too many tickets today — try again tomorrow." }, { status: 429 });

  const { subject, message } = (await req.json().catch(() => ({}))) as {
    subject?: unknown;
    message?: unknown;
  };
  const cleanSubject = typeof subject === "string" ? subject.trim().slice(0, 120) : "";
  const cleanMessage = typeof message === "string" ? message.trim().slice(0, 4000) : "";
  if (!cleanSubject) return NextResponse.json({ error: "Give your request a subject." }, { status: 400 });
  if (!cleanMessage) return NextResponse.json({ error: "Describe the problem first." }, { status: 400 });

  const { data: authRow } = await supabase.auth.admin.getUserById(user.id);
  const email = authRow?.user?.email ?? user.email ?? "";
  if (!email) return NextResponse.json({ error: "No email on this account." }, { status: 400 });

  const { data: ticket, error } = await supabase
    .from("support_tickets")
    .insert({ user_id: user.id, email, subject: cleanSubject, status: "open" })
    .select("id, subject, status, created_at, updated_at")
    .single();
  if (error || !ticket) {
    return NextResponse.json({ error: "Could not open the ticket." }, { status: 500 });
  }
  const { error: messageError } = await supabase.from("support_messages").insert({
    ticket_id: ticket.id,
    role: "user",
    content: cleanMessage,
  });
  if (messageError) {
    return NextResponse.json({ ticket, replyError: "Your request opened, but the first message could not be saved. Please send it again here." });
  }

  // A homepage topic or question is already the first turn. Answer it here,
  // exactly once, rather than waiting for another message in the thread.
  let reply: string;
  try {
    reply = await chatWithSupportTether({
      service: supabase,
      userId: user.id,
      history: [{ role: "user", content: cleanMessage }],
    });
  } catch (err) {
    reply = err instanceof DeepSeekUnavailableError
      ? "Tether is warming up — ask again in a moment."
      : err instanceof DeepSeekError
        ? "Tether hit a snag on that one — try again in a moment."
        : "Tether could not answer right now. Your request is saved — try again in a moment.";
  }
  const { error: replyError } = await supabase.from("support_messages").insert({
    ticket_id: ticket.id,
    role: "tether",
    content: reply,
  });
  if (replyError) {
    return NextResponse.json({ ticket, replyError: "Your message is saved, but Tether’s reply could not be saved. Please try again in this conversation." });
  }
  await supabase.from("support_tickets").update({ updated_at: new Date().toISOString() }).eq("id", ticket.id);
  return NextResponse.json({ ticket });
}

import { NextResponse } from "next/server";
import { getRouteUser, getServiceSupabase } from "@/lib/supabase/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { persistentRateLimitCheck } from "@/lib/auth-guard";
import { getClientIp, hashIp } from "@/lib/request-ip";
import type { DeepSeekChatMessage } from "@/lib/deepseek";
import { chatWithSupportTether } from "@/lib/tether-support";
import { DeepSeekError, DeepSeekUnavailableError } from "@/lib/deepseek";

export const maxDuration = 90;
export const dynamic = "force-dynamic";

// Tether is now intentionally varied in wording, so detect a concrete
// escalation question rather than an exact sentence. A human-review offer
// only counts when the reply both mentions human review/escalation and
// asks for the user's approval.
// Deliberately conservative: a short approving reply to the escalation
// offer routes the ticket to human review. Anything else goes to Tether
// normally, keeping false positives rare.
export function offersHumanReview(content: string): boolean {
  const text = content.toLowerCase();
  return (
    /(human review|human reviewer|send (it|this) up|pass (it|this) (up|along)|escalate)/.test(text) &&
    /(does that sound good|should i|want me to|sound good|go ahead)/.test(text)
  );
}
export function isSupportEscalationApproval(content: string): boolean {
  const value = content.trim().toLowerCase().replace(/[.!?]+$/, "");
  if (!value) return false;
  if (value.includes("not") || value.includes("no ") || value.startsWith("no")) return false;
  const affirms = value === "yes" ||
    value === "yeah" ||
    value === "yep" ||
    value === "sure" ||
    value === "ok" ||
    value === "okay" ||
    value === "please" ||
    value === "go ahead" ||
    value === "do it" ||
    value === "sounds good" ||
    value === "that sounds good" ||
    value === "escalate it" ||
    value === "escalate";
  return affirms || /^(yes|yeah|yep|sure|ok(?:ay)?|please),?\s+(please|go ahead|escalate|do it)$/i.test(content.trim());
}

async function ownTicket(supabase: NonNullable<ReturnType<typeof getServiceSupabase>>, ticketId: string, userId: string) {
  const { data } = await supabase
    .from("support_tickets")
    .select("id, user_id, status")
    .eq("id", ticketId)
    .maybeSingle();
  if (!data || data.user_id !== userId) return null;
  return data;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Unavailable" }, { status: 500 });

  const { id } = await params;
  const ticket = await ownTicket(supabase, id, user.id);
  if (!ticket) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });

  const { data, error } = await supabase
    .from("support_messages")
    .select("id, role, content, created_at")
    .eq("ticket_id", id)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) return NextResponse.json({ error: "Could not load messages." }, { status: 500 });
  return NextResponse.json({ ticket, messages: data ?? [] });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Unavailable" }, { status: 500 });

  const { id } = await params;
  const ticket = await ownTicket(supabase, id, user.id);
  if (!ticket) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
  if (ticket.status === "closed") {
    return NextResponse.json({ error: "This ticket is closed — open a new one." }, { status: 400 });
  }

  const limit = rateLimit(`support:msg:${user.id}`, 20, 3_600_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
  const ip = getClientIp(req);
  const checks = [{ key: `support:msg:${user.id}`, max: 40, windowSeconds: 3_600 }];
  if (ip) checks.push({ key: `support:ip:${hashIp(ip)}`, max: 80, windowSeconds: 3_600 });
  if (await persistentRateLimitCheck(supabase, checks)) {
    return NextResponse.json({ error: "Slow down a little." }, { status: 429 });
  }

  const { message } = (await req.json().catch(() => ({}))) as { message?: unknown };
  const content = typeof message === "string" ? message.trim().slice(0, 4000) : "";
  if (!content) return NextResponse.json({ error: "Write a message first." }, { status: 400 });

  const { error: insertError } = await supabase.from("support_messages").insert({
    ticket_id: id,
    role: "user",
    content,
  });
  if (insertError) return NextResponse.json({ error: "Could not send." }, { status: 500 });

  await supabase
    .from("support_tickets")
    .update({
      ...(ticket.status === "human_reply" ? { status: "open" } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  // Conversation window for the model: last 20 messages, user + tether only.
  // No ticket ids, user ids, or emails are included — the tools already know
  // whose account this is from the server-side session.
  const { data: rows } = await supabase
    .from("support_messages")
    .select("role, content")
    .eq("ticket_id", id)
    .order("created_at", { ascending: false })
    .limit(20);
  const desc = (rows ?? []) as { role: string; content: string }[];

  // If Tether just proposed a human handoff and the user accepted it, carry
  // the request forward immediately rather than making another model turn.
  const lastTetherMessage = desc.find((m) => m.role === "tether" || m.role === "assistant");
  const acceptedEscalation =
    ticket.status !== "closed" &&
    !!lastTetherMessage?.content && offersHumanReview(lastTetherMessage.content) &&
    isSupportEscalationApproval(content);

  if (acceptedEscalation) {
    const escalationReply =
      "I’ve escalated this to our human support team. They’ll review your account context and reply within up to 48 hours. You don’t need to repeat anything — they’ll have the full conversation.";
    await supabase
      .from("support_tickets")
      .update({ status: "pending", updated_at: new Date().toISOString() })
      .eq("id", id);
    await supabase.from("support_messages").insert({ ticket_id: id, role: "tether", content: escalationReply });
    return NextResponse.json({ reply: escalationReply, escalated: true });
  }

  const history: DeepSeekChatMessage[] = desc
    .reverse()
    .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "tether")
    .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content }));

  let reply: string;
  try {
    reply = await chatWithSupportTether({ service: supabase, userId: user.id, history });
  } catch (err) {
    if (err instanceof DeepSeekUnavailableError) {
      reply = "Tether is warming up — ask again in a moment.";
    } else if (err instanceof DeepSeekError) {
      reply = "Tether hit a snag on that one — try again in a moment.";
    } else {
      return NextResponse.json({ error: "Tether could not answer right now." }, { status: 502 });
    }
  }

  await supabase.from("support_messages").insert({ ticket_id: id, role: "tether", content: reply });
  await supabase.from("support_tickets").update({ updated_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ reply });
}

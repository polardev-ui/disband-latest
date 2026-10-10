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

  // Conversation window for the model: last 20 messages, user + tether only.
  // No ticket ids, user ids, or emails are included — the tools already know
  // whose account this is from the server-side session.
  const { data: rows } = await supabase
    .from("support_messages")
    .select("role, content")
    .eq("ticket_id", id)
    .order("created_at", { ascending: false })
    .limit(20);
  const history: DeepSeekChatMessage[] = ((rows ?? []) as { role: string; content: string }[])
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

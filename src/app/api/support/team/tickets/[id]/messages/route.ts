import { NextResponse } from "next/server";
import { getRouteUser, getServiceSupabase } from "@/lib/supabase/server";
import { isSupportStaff } from "@/lib/support/staff";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isSupportStaff(user.id)) return NextResponse.json({ error: "Access denied." }, { status: 403 });

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Unavailable" }, { status: 500 });

  const { id } = await params;

  const { data: ticket, error: ticketError } = await supabase
    .from("support_tickets")
    .select("id, user_id, email, subject, status, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (ticketError || !ticket) {
    return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("support_messages")
    .select("id, role, content, created_at")
    .eq("ticket_id", id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: "Could not load messages." }, { status: 500 });

  return NextResponse.json({ ticket, messages: data ?? [] });
}

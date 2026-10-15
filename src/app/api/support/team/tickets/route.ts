import { NextResponse } from "next/server";
import { getRouteUser, getServiceSupabase } from "@/lib/supabase/server";
import { isSupportStaff } from "@/lib/support/staff";

type TeamTicket = {
  id: string;
  user_id: string;
  email: string;
  subject: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export async function GET(req: Request) {
  const user = await getRouteUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isSupportStaff(user.id)) return NextResponse.json({ error: "Access denied." }, { status: 403 });

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Unavailable" }, { status: 500 });

  const { data, error } = await supabase
    .from("support_tickets")
    .select("id, user_id, email, subject, status, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: "Could not load tickets." }, { status: 500 });

  const rank = (status: string) =>
    status === "pending" ? 0 : status === "human_reply" ? 1 : status === "open" ? 2 : 3;

  const tickets = ((data ?? []) as TeamTicket[]).sort((a, b) => {
    if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
    return b.updated_at.localeCompare(a.updated_at);
  });

  return NextResponse.json({ tickets });
}

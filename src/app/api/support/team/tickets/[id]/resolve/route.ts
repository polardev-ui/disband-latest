import { NextResponse } from "next/server";
import { getRouteUser, getServiceSupabase } from "@/lib/supabase/server";


export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRouteUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Unavailable" }, { status: 500 });
  const { data: staffProfile } = await supabase.from("profiles").select("is_support_staff").eq("id", user.id).maybeSingle();
  if (!staffProfile?.is_support_staff) return NextResponse.json({ error: "Access denied." }, { status: 403 });

  const { id } = await params;
  const { error } = await supabase
    .from("support_tickets")
    .update({ status: "closed", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: "Could not resolve ticket." }, { status: 500 });

  await supabase
    .from("support_messages")
    .insert({ ticket_id: id, role: "staff", content: "This request has been reviewed and marked resolved by the support team." });

  return NextResponse.json({ ok: true });
}

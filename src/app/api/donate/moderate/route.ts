import { NextResponse } from "next/server";
import { requireSupportStaff } from "@/lib/server-auth";
import { getRouteUser, getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Whether the viewer can hide wall messages (staff only). */
export async function GET(req: Request) {
  const user = await getRouteUser(req);
  const staff = !!user && (await requireSupportStaff(user.id));
  return NextResponse.json({ staff }, { headers: { "Cache-Control": "private, no-store" } });
}

/** Staff: hide or restore a donation's message on the public wall. The amount still counts. */
export async function PATCH(req: Request) {
  const user = await getRouteUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!(await requireSupportStaff(user.id))) return NextResponse.json({ error: "Access denied." }, { status: 403 });
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const { id, hidden } = (await req.json().catch(() => ({}))) as { id?: unknown; hidden?: unknown };
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id) || typeof hidden !== "boolean") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { error } = await supabase
    .from("donations")
    .update({ hidden, hidden_by: hidden ? user.id : null })
    .eq("id", id);
  if (error) return NextResponse.json({ error: "Couldn't update that donation." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

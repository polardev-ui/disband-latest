import { NextResponse } from "next/server";
import { getRouteUser, getUserScopedSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getRouteUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const scoped = getUserScopedSupabase(request);
  if (!scoped) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const { data, error } = await scoped.rpc("cancel_account_deletion");
  if (error) {
    console.error("[account/cancel-deletion]", error.message);
    return NextResponse.json({ error: "Could not cancel deletion." }, { status: 500 });
  }
  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok === false) {
    return NextResponse.json({ error: row.error ?? "Cannot cancel deletion now." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, ...row });
}

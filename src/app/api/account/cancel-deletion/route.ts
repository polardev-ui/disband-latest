import { NextResponse } from "next/server";
import { getRouteUser, getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getRouteUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // The deletion timestamps are guarded from client-side updates by
  // guard_profile_sensitive_columns / protect_profile_security_fields even
  // inside a SECURITY DEFINER RPC, because auth.uid() is still the caller.
  // Use the service role, after authenticating the caller above, so the
  // cancellation actually clears them.
  const service = getServiceSupabase();
  if (!service) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const { data, error } = await service.rpc("cancel_account_deletion_for_user", {
    p_user_id: user.id,
  });
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

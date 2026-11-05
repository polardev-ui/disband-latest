import { NextResponse } from "next/server";
import { getRouteUser, getServiceSupabase } from "@/lib/supabase/server";
import { purgeAnonymousAccount } from "@/lib/anon-accounts.server";
import { findAnonByNumber } from "@/lib/anon-accounts.server";

export const dynamic = "force-dynamic";

/**
 * DELETE that starts the deletion flow.
 * Anonymous accounts are wiped instantly; regular accounts enter a 14-day
 * soft-delete with a 24-hour cancel window.
 */
export async function POST(request: Request) {
  const user = await getRouteUser(request);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const service = getServiceSupabase();
  if (!service) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const { data: profile } = await service
    .from("profiles")
    .select("account_type")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.account_type === "anonymous") {
    // Instant delete. Clean the registry first if present.
    const { data: reg } = await service
      .from("anonymous_accounts")
      .select("id, user_id, tier, expires_at, purge_after, expires_processed_at, data_purged_at, purged_reason")
      .eq("user_id", user.id)
      .maybeSingle();

    try {
      if (reg) {
        await purgeAnonymousAccount(reg as never, "user_deleted_via_settings");
      } else {
        const { error } = await service.auth.admin.deleteUser(user.id);
        if (error && !/not found/i.test(error.message)) throw error;
      }
    } catch (err) {
      console.error("[account/delete] anon delete failed", err);
      return NextResponse.json({ error: "Could not delete the account. Try again." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, instant: true });
  }

  // Use the service role so the deletion timestamps aren't reverted by the
  // protect_profile_security_fields trigger (which blocks client-side updates).
  const { data, error } = await service.rpc("request_account_deletion_for_user", { p_user_id: user.id });
  if (error) {
    console.error("[account/delete]", error.message);
    return NextResponse.json({ error: "Could not start deletion. Try again." }, { status: 500 });
  }
  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok === false) {
    return NextResponse.json({ error: row.error ?? "Could not start deletion." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, ...row });
}

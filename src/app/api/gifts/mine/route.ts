import { NextResponse } from "next/server";
import { getRouteUser, getServiceSupabase } from "@/lib/supabase/server";

const GIFT_COLUMNS =
  "code, plan, months, status, buyer_id, claimed_by, claimed_at, expires_at, created_at";

/**
 * The caller's gift ledger: what they've bought (pending / unclaimed /
 * claimed / refunded) and what they've claimed themselves. The settings
 * screen renders this so a gift link is never lost to a page refresh.
 */
export async function GET(req: Request) {
  try {
    const user = await getRouteUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const supabase = getServiceSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Gifting is not configured." }, { status: 500 });
    }

    const [sent, received] = await Promise.all([
      supabase
        .from("gifts")
        .select(GIFT_COLUMNS)
        .eq("buyer_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("gifts")
        .select(GIFT_COLUMNS)
        .eq("claimed_by", user.id)
        .order("claimed_at", { ascending: false })
        .limit(50),
    ]);

    if (sent.error || received.error) {
      console.error("gifts/mine failed", sent.error?.message, received.error?.message);
      return NextResponse.json({ error: "Could not load gifts." }, { status: 500 });
    }

    return NextResponse.json({ sent: sent.data ?? [], received: received.data ?? [] });
  } catch (err) {
    console.error("gifts/mine error", err);
    return NextResponse.json({ error: "Could not load gifts." }, { status: 500 });
  }
}

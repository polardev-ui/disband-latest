import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { DonationWall, DonationWallEntry } from "@/lib/donations";

export const dynamic = "force-dynamic";

const WALL_SIZE = 60;

/*
 The public donor wall: the total raised, how many donations, and the most
 recent paid ones. A donor's name and avatar appear only if they were signed
 in and chose to show them; everyone else is anonymous. Messages a staff
 member has hidden are left out, but the amount still counts towards the total.
 Cached briefly at the edge so a busy page doesn't hit the database every view.
*/
export async function GET() {
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const [{ data: paid, error: totalError }, { data: recent, error: listError }] = await Promise.all([
    supabase.from("donations").select("amount_cents").eq("status", "paid").limit(100_000),
    supabase
      .from("donations")
      .select("id, user_id, show_name, amount_cents, message, hidden, paid_at")
      .eq("status", "paid")
      .order("paid_at", { ascending: false })
      .limit(WALL_SIZE),
  ]);
  if (totalError || listError) {
    return NextResponse.json({ error: "Couldn't load donations." }, { status: 500 });
  }

  const rows = (recent ?? []) as Array<{
    id: string;
    user_id: string | null;
    show_name: boolean;
    amount_cents: number;
    message: string | null;
    hidden: boolean;
    paid_at: string;
  }>;

  const named = [...new Set(rows.filter((r) => r.show_name && r.user_id).map((r) => r.user_id as string))];
  const profiles = new Map<string, { name: string; avatar: string | null }>();
  if (named.length) {
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, username, avatar_url")
      .in("id", named);
    for (const p of data ?? []) {
      profiles.set(p.id as string, {
        name: (p.display_name as string | null) || (p.username as string | null) || "Someone",
        avatar: (p.avatar_url as string | null) ?? null,
      });
    }
  }

  const entries: DonationWallEntry[] = rows.map((r) => {
    const profile = r.show_name && r.user_id ? profiles.get(r.user_id) : undefined;
    return {
      id: r.id,
      name: profile?.name ?? null,
      avatarUrl: profile?.avatar ?? null,
      amountCents: r.amount_cents,
      message: r.hidden ? null : r.message,
      paidAt: r.paid_at,
    };
  });

  const wall: DonationWall = {
    totalCents: (paid ?? []).reduce((sum, r) => sum + ((r.amount_cents as number) || 0), 0),
    donorCount: (paid ?? []).length,
    entries,
  };
  return NextResponse.json(wall, {
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" },
  });
}

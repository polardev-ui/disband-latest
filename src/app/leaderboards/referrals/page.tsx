"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ReferralLeaderboard, type LeaderRow } from "@/components/referrals/ReferralLeaderboard";

/**
 * Client-rendered on purpose: the Tauri/iOS build is a static export with no
 * server runtime, so a force-dynamic server page breaks `pnpm build:tauri`.
 * The `referral_leaderboard` RPC is granted to anon/authenticated, so the
 * browser (and the native WebView, straight to Supabase) can load it live.
 * Prerender emits the loading state; hydration fills the board.
 */
export default function ReferralLeaderboardPage() {
  const [rows, setRows] = useState<LeaderRow[] | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const { data } = await getSupabaseClient().rpc("referral_leaderboard", { p_limit: 50 });
        if (!live) return;
        setRows(
          ((data ?? []) as (Omit<LeaderRow, "standing" | "verified_count"> & {
            standing: string | number;
            verified_count: string | number;
          })[]).map((row) => ({
            standing: Number(row.standing),
            user_id: row.user_id,
            display_name: row.display_name,
            username: row.username,
            code: row.code,
            verified_count: Number(row.verified_count),
          })),
        );
      } catch {
        if (live) setRows([]);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  if (!rows) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-text-muted/30 border-t-text-muted" />
      </div>
    );
  }
  return <ReferralLeaderboard rows={rows} />;
}

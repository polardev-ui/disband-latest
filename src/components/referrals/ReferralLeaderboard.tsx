"use client";

import Link from "next/link";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { Logo } from "@/components/ui/Logo";
import { MyReferralCard } from "@/components/referrals/MyReferralCard";

export interface LeaderRow {
  standing: number;
  user_id: string;
  display_name: string | null;
  username: string | null;
  code: string | null;
  verified_count: number;
}

function Board({ rows, empty }: { rows: LeaderRow[]; empty: string }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-divider px-5 py-10 text-center text-[14px] text-text-muted">
        {empty}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-divider">
      <table className="w-full border-collapse text-left text-[14px]">
        <thead>
          <tr className="border-b border-divider bg-bg-accent text-[11px] uppercase tracking-wide text-text-muted">
            <th scope="col" className="px-4 py-3 font-bold">#</th>
            <th scope="col" className="px-4 py-3 font-bold">Referrer</th>
            <th scope="col" className="px-4 py-3 font-bold">Code</th>
            <th scope="col" className="px-4 py-3 text-right font-bold">Verified</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.user_id} className="border-b border-divider/60 last:border-0">
              <td className="px-4 py-3 tabular-nums text-text-muted">{row.standing}</td>
              <td className="px-4 py-3">
                <span className="font-medium text-text-normal">
                  {row.display_name || row.username || "Account"}
                </span>
                {row.username && (
                  <span className="ml-2 text-text-muted">@{row.username}</span>
                )}
              </td>
              <td className="px-4 py-3 font-mono tracking-wide text-text-normal">{row.code}</td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums text-text-normal">
                {row.verified_count}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReferralLeaderboard({ rows }: { rows: LeaderRow[] }) {
  return (
    <ThemeProvider>
      <div className="min-h-screen bg-bg-tertiary px-6 py-12">
        <div className="mx-auto max-w-[720px]">
          <div className="flex flex-col items-center text-center">
            <Logo adaptive size={44} className="h-11 w-11" priority />
            <h1 className="mt-5 text-[30px] font-semibold tracking-[-0.02em] text-text-normal">
              Referral Leaderboard
            </h1>
            <p className="mt-2 max-w-[34rem] text-[15px] leading-relaxed text-text-muted">
              The referrer with the most verified referrals wins a{" "}
              <strong className="text-text-normal">$100 Visa gift card</strong>, awarded in
              December. A referral counts the moment the invited friend verifies their email —
              ties go to whoever reached the count first.
            </p>
          </div>

          <div className="mt-8">
            <MyReferralCard />
          </div>

          <section className="mt-10">
            <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-text-muted">
              Standings
            </h2>
            <Board
              rows={rows}
              empty="No verified referrals yet — share your code and be the first on the board."
            />
          </section>

          <p className="mt-8 text-center text-[13px] text-text-muted">
            <Link href="/login" className="font-medium text-text-normal hover:text-brand">
              Create an account
            </Link>{" "}
            to get your own referral code.
          </p>
        </div>
      </div>
    </ThemeProvider>
  );
}

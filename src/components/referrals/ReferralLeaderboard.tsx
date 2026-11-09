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
      <p className="rounded-2xl border border-dashed border-border-strong px-5 py-10 text-center text-[14px] text-text-muted">
        {empty}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-border-subtle bg-bg-secondary-alt">
      <table className="w-full border-collapse text-left text-[14px]">
        <thead>
          <tr className="border-b border-border-subtle bg-bg-tertiary text-[11px] uppercase tracking-wide text-text-muted">
            <th scope="col" className="px-4 py-3 font-bold">#</th>
            <th scope="col" className="px-4 py-3 font-bold">Referrer</th>
            <th scope="col" className="px-4 py-3 font-bold">Code</th>
            <th scope="col" className="px-4 py-3 text-right font-bold">Verified</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.user_id} className="border-b border-border-subtle last:border-0 transition-colors hover:bg-interactive-hover">
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
      <div className="min-h-screen bg-bg-secondary">
        <div className="aero-hero px-6 pb-20 pt-14 text-white">
          <div className="mx-auto flex max-w-[720px] flex-col items-center text-center">
            <Logo size={48} className="h-12 w-12" priority />
            <h1 className="mt-5 text-[40px] font-extrabold tracking-[-0.03em] text-white">
              Referral Leaderboard
            </h1>
            <p className="mt-3 max-w-[34rem] text-[16px] leading-relaxed text-white/85">
              The referrer with the most verified referrals wins a{" "}
              <strong className="text-white">$100 Visa gift card</strong>, awarded in
              December. A referral counts the moment the invited friend verifies their email —
              ties go to whoever reached the count first.
            </p>
          </div>
        </div>
        <div className="mx-auto -mt-10 max-w-[720px] px-6 pb-12">
          <div>
            <MyReferralCard />
          </div>

          <section className="mt-10">
            <h2 className="mb-3 text-[18px] font-bold text-header-primary">
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

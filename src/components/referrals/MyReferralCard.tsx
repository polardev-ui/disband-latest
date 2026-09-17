"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";

export function MyReferralCard() {
  const [code, setCode] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const supabase = getSupabaseClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setSignedIn(false);
          return;
        }
        setSignedIn(true);
        const { data: codeRow } = await supabase
          .from("referral_codes")
          .select("code")
          .eq("user_id", user.id)
          .maybeSingle();
        setCode(codeRow?.code ?? null);
        const { count: verified } = await supabase
          .from("referrals")
          .select("id", { count: "exact", head: true })
          .eq("referrer_id", user.id)
          .eq("status", "verified");
        setCount(verified ?? 0);
      } catch {
        setSignedIn(false);
      }
    })();
  }, []);

  if (signedIn === false) {
    return (
      <div className="rounded-xl border border-divider bg-bg-secondary p-5 text-[14px] text-text-muted">
        <span className="text-text-normal">Have an account?</span> Sign in to get your referral
        code and start climbing the leaderboard.{" "}
        <Link href="/login" className="font-medium text-brand hover:underline">
          Sign in →
        </Link>
      </div>
    );
  }

  const shareUrl = code ? `${typeof window !== "undefined" ? window.location.origin : "https://disband.dev"}/referral/${code}` : null;

  return (
    <div className="rounded-xl border border-divider bg-bg-secondary p-5">
      <div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Verified referrals
          </p>
          <p className="mt-1 text-[18px] font-semibold tabular-nums text-text-normal">
            {count ?? "—"}
          </p>
        </div>
      </div>
      {shareUrl && (
        <div className="mt-4 flex items-center gap-2">
          <input
            readOnly
            value={shareUrl}
            aria-label="Your referral link"
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 rounded-md border border-divider bg-bg-accent px-3 py-2 font-mono text-[13px] text-text-normal outline-none"
          />
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(shareUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="shrink-0 rounded-md bg-brand px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-brand-hover"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      )}
      <p className="mt-3 text-[12px] leading-relaxed text-text-muted">
        A referral counts when the friend who used your code signs up and verifies their email.
      </p>
    </div>
  );
}

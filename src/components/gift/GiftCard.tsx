"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { GIFT_PLAN_NAME, monthsLabel, type GiftPlan } from "@/lib/gifts";
import { invalidateEntitlement } from "@/lib/entitlement-store";
import { invalidateBadges } from "@/lib/badge-store";
import { ClaimAnimation } from "./ClaimAnimation";

interface GiftRow {
  code: string;
  plan: GiftPlan;
  months: number;
  status: string;
  buyer_id: string;
  claimed_by: string | null;
  expires_at: string;
}

export function GiftCard({ code, onLoad }: { code: string; onLoad?: () => void }) {
  const { user, profile } = useApp();
  const [gift, setGift] = useState<GiftRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [buyerName, setBuyerName] = useState<string>("Someone");

  useEffect(() => {
    let alive = true;
    void (async () => {
      const supabase = getSupabaseClient();
      const { data } = await supabase
        .from("gifts")
        .select("code, plan, months, status, buyer_id, claimed_by, expires_at")
        .eq("code", code)
        .maybeSingle();
      if (!alive) return;
      setGift((data as GiftRow) ?? null);
      setLoading(false);
      onLoad?.();

      if (data?.buyer_id) {
        const { data: p } = await supabase
          .from("profiles").select("display_name, username").eq("id", data.buyer_id).maybeSingle();
        if (alive && p) setBuyerName(p.display_name || p.username || "Someone");
      }
    })();
    return () => { alive = false; };
  }, [code, onLoad]);

  if (loading || !gift) return null;

  const mine = gift.buyer_id === user?.id;
  const claimedByMe = gift.claimed_by === user?.id;
  const gone = gift.status === "claimed" || gift.status === "expired";

  const accent = "#fee75c";

  async function claim() {
    if (claiming) return;
    setClaiming(true);
    setError(null);
    try {
      const { data, error: rpcError } = await getSupabaseClient()
        .rpc("claim_gift", { p_code: code });
      const res = (data ?? {}) as { ok?: boolean; error?: string };
      if (rpcError || !res.ok) {
        setError(res.error ?? rpcError?.message ?? "Could not claim this gift.");

        const { data: fresh } = await getSupabaseClient()
          .from("gifts")
          .select("code, plan, months, status, buyer_id, claimed_by, expires_at")
          .eq("code", code).maybeSingle();
        if (fresh) setGift(fresh as GiftRow);
        return;
      }
      if (user?.id) {
        invalidateEntitlement(user.id);
        invalidateBadges(user.id);
      }
      if (gift) invalidateBadges(gift.buyer_id);
      setGift({ ...gift!, status: "claimed", claimed_by: user?.id ?? null });
      setCelebrate(true);
    } finally {
      setClaiming(false);
    }
  }

  return (
    <>
      <div
        className="mt-1.5 max-w-[420px] overflow-hidden rounded-lg border-l-4 bg-bg-secondary"
        style={{ borderColor: gone && !claimedByMe ? "var(--color-divider)" : accent }}
      >
        <div className="flex items-center gap-3 px-4 pt-4">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            style={{ background: `${accent}22`, color: accent }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="10" width="18" height="11" rx="1.8" />
              <path d="M3 14.4h18M12 10v11" />
              <path d="M12 10S10.6 5.4 8.2 5.4a2.3 2.3 0 0 0 0 4.6ZM12 10s1.4-4.6 3.8-4.6a2.3 2.3 0 0 1 0 4.6Z" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
              {mine ? "Your gift" : `A gift from ${buyerName}`}
            </p>
            <p className="truncate text-[15px] font-semibold text-text-normal">
              {GIFT_PLAN_NAME[gift.plan]}
            </p>
            <p className="text-[13px] text-text-muted">
              {monthsLabel(gift.months)}
              {!gone && " · first to claim it gets it"}
            </p>
          </div>
        </div>

        <div className="px-4 pb-4 pt-3">
          {claimedByMe ? (
            <p className="flex items-center gap-2 text-[13px] font-medium" style={{ color: accent }}>
              <Tick /> Claimed by you
            </p>
          ) : gift.status === "claimed" ? (
            <p className="text-[13px] text-text-muted">Already claimed.</p>
          ) : gift.status === "expired" ? (
            <p className="text-[13px] text-text-muted">This gift expired.</p>
          ) : gift.status === "pending" ? (
            <p className="text-[13px] text-text-muted">Waiting for payment to clear…</p>
          ) : mine ? (
            <p className="text-[13px] text-text-muted">Waiting for someone to claim it.</p>
          ) : (
            <button
              type="button"
              disabled={claiming}
              onClick={() => void claim()}
              className="w-full rounded-lg py-2.5 text-[15px] font-semibold text-[#111] transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ background: accent }}
            >
              {claiming ? "Claiming…" : "Claim"}
            </button>
          )}
          {error && <p className="mt-2 text-[12px] text-status-dnd">{error}</p>}
        </div>
      </div>

      {celebrate && (
        <ClaimAnimation
          plan={gift.plan}
          months={gift.months}
          fromName={buyerName}
          onClose={() => setCelebrate(false)}
        />
      )}
      {}
      {profile ? null : null}
    </>
  );
}

function Tick() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useOptionalApp } from "@/contexts/AppContext";
import { GIFT_PLAN_NAME, monthsLabel, type GiftPlan } from "@/lib/gifts";
import { invalidateEntitlement } from "@/lib/entitlement-store";
import { invalidateBadges } from "@/lib/badge-store";
import { ClaimAnimation } from "./ClaimAnimation";
import { GiftArtwork } from "./GiftArtwork";

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
  // Inside chat the provider supplies the user; on the standalone /gift
  // page there is no provider, so fall back to the raw session. Either
  // way only the id is needed (ownership display + cache invalidation).
  const app = useOptionalApp();
  const [standaloneUserId, setStandaloneUserId] = useState<string | null>(null);
  useEffect(() => {
    if (app) return;
    let alive = true;
    void getSupabaseClient().auth.getSession().then(({ data }) => {
      if (alive) setStandaloneUserId(data.session?.user.id ?? null);
    });
    return () => { alive = false; };
  }, [app]);
  const userId = app?.user?.id ?? standaloneUserId;
  const [gift, setGift] = useState<GiftRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [buyerName, setBuyerName] = useState<string>("Someone");

  async function load() {
    const supabase = getSupabaseClient();
    const { data } = await supabase.rpc("get_gift", { p_code: code });
    return (data as GiftRow | null) ?? null;
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void (async () => {
      const data = await load();
      if (!alive) return;
      setGift(data);
      setLoading(false);
      onLoad?.();

      if (data?.buyer_id) {
        const supabase = getSupabaseClient();
        const { data: p } = await supabase
          .from("profiles").select("display_name, username").eq("id", data.buyer_id).maybeSingle();
        if (alive && p) setBuyerName(p.display_name || p.username || "Someone");
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  async function refresh() {
    setRefreshing(true);
    const data = await load();
    setGift(data);
    setRefreshing(false);
    onLoad?.();
  }

  // An unknown code used to render nothing at all — indistinguishable from
  // still-loading. Show a skeleton, then an honest invalid state.
  if (loading) {
    return (
      <div aria-label="Loading gift" role="status" className="@container mt-1.5 w-[580px] max-w-full animate-pulse overflow-hidden rounded-[4px] bg-bg-secondary">
        <div className="grid grid-cols-1 @[480px]:grid-cols-[1.15fr_1fr]">
          <div className="order-2 flex min-h-[180px] flex-col p-4 @[480px]:order-1">
            <div className="h-4 w-5/6 rounded bg-bg-accent" />
            <div className="mt-3 h-3 w-3/4 rounded bg-bg-accent" />
            <div className="mt-auto h-8 w-20 rounded-[3px] bg-bg-accent" />
          </div>
          <div className="order-1 h-[160px] bg-bg-accent @[480px]:order-2 @[480px]:h-full" />
        </div>
      </div>
    );
  }

  if (!gift) {
    return (
      <div className="mt-1.5 w-[580px] max-w-full rounded-[4px] bg-bg-secondary px-4 py-3">
        <p className="text-[13px] text-text-muted">
          This gift link is invalid or has expired.
        </p>
      </div>
    );
  }

  const mine = gift.buyer_id === userId;
  const claimedByMe = Boolean(userId && gift.status === "claimed" && gift.claimed_by === userId);

  async function claim() {
    if (claiming) return;
    if (app?.profile?.account_type === "anonymous") {
      setError("Anonymous accounts can't claim gifts.");
      return;
    }
    setClaiming(true);
    setError(null);
    try {
      const { data, error: rpcError } = await getSupabaseClient()
        .rpc("claim_gift", { p_code: code });
      const res = (data ?? {}) as { ok?: boolean; error?: string };
      if (rpcError || !res.ok) {
        setError(res.error ?? rpcError?.message ?? "Could not claim this gift.");

        const { data: fresh } = await getSupabaseClient()
          .rpc("get_gift", { p_code: code });
        if (fresh) setGift(fresh as GiftRow);
        return;
      }
      if (userId) {
        invalidateEntitlement(userId);
        invalidateBadges(userId);
      }
      if (gift) invalidateBadges(gift.buyer_id);
      setGift({ ...gift!, status: "claimed", claimed_by: userId });
      setCelebrate(true);
    } finally {
      setClaiming(false);
    }
  }

  return (
    <>
      <GiftCardContent
        gift={gift} buyerName={buyerName} mine={mine} claimedByMe={claimedByMe}
        claiming={claiming} refreshing={refreshing} error={error}
        onClaim={() => void claim()} onRefresh={() => void refresh()}
      />

      {celebrate && (
        <ClaimAnimation
          plan={gift.plan}
          months={gift.months}
          fromName={buyerName}
          onClose={() => setCelebrate(false)}
        />
      )}
    </>
  );
}

interface GiftCardContentProps {
  gift: GiftRow;
  buyerName: string;
  mine?: boolean;
  claimedByMe?: boolean;
  claiming?: boolean;
  refreshing?: boolean;
  error?: string | null;
  onClaim: () => void;
  onRefresh: () => void;
}

export function GiftCardContent({ gift, buyerName, mine, claimedByMe, claiming, refreshing, error, onClaim, onRefresh }: GiftCardContentProps) {
  const gone = ["claimed", "expired", "refunded"].includes(gift.status);
  const pending = gift.status === "pending";
  const expires = new Date(gift.expires_at);
  const expiryLabel = Number.isNaN(expires.getTime()) ? null : expires.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return (
    <div className="@container mt-1.5 w-[580px] max-w-full overflow-hidden rounded-[4px] bg-bg-secondary">
      <div className="grid grid-cols-1 @[480px]:grid-cols-[1.15fr_1fr]">
        <div className="order-2 flex min-h-[165px] min-w-0 flex-col p-4 @[480px]:order-1">
          <h3 className="text-[16px] font-bold leading-5 text-header-primary">
            {mine ? "You sent a subscription gift!" : pending ? "A subscription gift for you!" : "You’ve been gifted a subscription!"}
          </h3>
          <p className="mt-2 break-words text-[13px] leading-[18px] text-header-secondary">
            {mine ? "You gifted" : <><strong className="font-semibold">{buyerName}</strong> has gifted you</>} <strong className="font-semibold">{monthsLabel(gift.months)}</strong> of <strong className="font-semibold">{GIFT_PLAN_NAME[gift.plan]}</strong>.
          </p>
          <div className="mt-auto pt-5">
            {claimedByMe ? (
              <p role="status" className="flex items-center gap-2 text-[13px] font-medium text-status-online"><Tick /> Accepted by you</p>
            ) : gone ? (
              <p role="status" className="text-[13px] text-text-muted">
                {gift.status === "claimed" ? "Already accepted" : gift.status === "expired" ? "This gift has expired." : "This gift was refunded and is no longer available."}
              </p>
            ) : pending ? (
              <div className="flex flex-wrap items-center gap-2">
                <p role="status" className="flex min-w-0 flex-1 items-center gap-2 text-[12px] leading-4 text-text-muted">
                  <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-text-muted/40 border-t-text-muted" aria-hidden />Waiting for payment to clear…
                </p>
                <button type="button" disabled={refreshing} onClick={onRefresh} className="rounded-[3px] bg-button-secondary px-3 py-1.5 text-[12px] font-medium text-white hover:bg-button-secondary-hover disabled:opacity-50">{refreshing ? "Checking…" : "Refresh"}</button>
              </div>
            ) : (
              <div className="flex flex-wrap items-end justify-between gap-2">
                {mine ? <p className="text-[13px] text-text-muted">Waiting to be accepted</p> : (
                  <button type="button" disabled={claiming} onClick={onClaim} className="h-8 rounded-[3px] bg-button-green px-4 text-[14px] font-medium text-white transition-colors hover:bg-button-green-hover disabled:cursor-wait disabled:opacity-60">{claiming ? "Accepting…" : "Accept"}</button>
                )}
                {expiryLabel && <time dateTime={gift.expires_at} title={expires.toLocaleString("en-GB")} className="pb-1 text-[11px] text-text-muted">Expires {expiryLabel}</time>}
              </div>
            )}
            {error && <p role="alert" className="mt-2 text-[12px] text-status-dnd">{error}</p>}
          </div>
        </div>
        <div className={`order-1 min-w-0 @[480px]:order-2 ${gone && !claimedByMe ? "opacity-50 grayscale" : ""}`}>
          <GiftArtwork plan={gift.plan} />
        </div>
      </div>
    </div>
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

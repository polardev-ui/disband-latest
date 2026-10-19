"use client";

import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";

import { useState } from "react";
import { createPortal } from "react-dom";
import { StripeEmbeddedCheckout } from "@/components/subscription/StripeEmbeddedCheckout";
import { apiFetch } from "@/lib/api";
import {
  GIFT_MONTHS, GIFT_PLAN_NAME, formatPrice, giftPrice, monthsLabel, savingsPercent,
  type GiftMonths, type GiftPlan,
} from "@/lib/gifts";
import { SubscriptionMedallion, tierForMonths } from "./SubscriptionMedallion";

export function GiftModal({ onClose, onPurchased, exiting }: {
  onClose: () => void;
  onPurchased: (code: string) => void;
  exiting?: boolean;
}) {

  const [plan, setPlan] = useState<GiftPlan>("aero");
  const [months, setMonths] = useState<GiftMonths>(1);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Always mounted when rendered (no `open` prop) — active unconditionally.
  useOverlayDismiss(onClose);

  const price = giftPrice(plan, months);
  const saving = savingsPercent(plan, months);
  const tier = tierForMonths(months);

  async function startCheckout() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/api/gifts/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, months }),
      });
      const json = (await res.json()) as { clientSecret?: string; code?: string; error?: string };
      if (!res.ok || !json.clientSecret || !json.code) {
        setError(json.error ?? "Could not start checkout.");
        return;
      }
      setClientSecret(json.clientSecret);
      setCode(json.code);
    } catch {
      setError("Could not reach the billing service.");
    } finally {
      setBusy(false);
    }
  }

  const PLAN_BLURB: Record<GiftPlan, string> = {
    // From PLANS in lib/subscription — keep these in step with it.
    aero: "500 MB uploads, 4K screen share, skins",
    lite: "100 MB uploads, 1080p video",
  };

  const body = (
    <div
      className={`fixed inset-0 z-[95] flex items-center justify-center overflow-y-auto bg-black/85 overlay-fade${exiting ? " overlay-fade-out" : ""} p-4`}
      role="dialog"
      aria-modal="true"
      aria-label="Gift a subscription"
      onClick={onClose}
    >
      <div
        className={`modal-pop${exiting ? " modal-pop-out" : ""} channel-scroll relative max-h-[calc(100dvh-32px)] w-full max-w-[460px] overflow-y-auto rounded-lg bg-bg-primary text-text-normal shadow-[var(--elevation-high)]`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center text-interactive-normal transition-colors hover:text-interactive-active"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        {clientSecret && code ? (
          <div className="p-6">
            <p className="text-[12px] font-bold uppercase tracking-[0.02em] text-header-secondary">Checkout</p>
            <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.02em]">
              {GIFT_PLAN_NAME[plan]} · {monthsLabel(months)}
            </h2>
            <p className="mb-5 mt-1 text-[14px] text-text-muted">
              {formatPrice(price)} once. The gift is posted as soon as payment goes through.
            </p>
            <StripeEmbeddedCheckout
              clientSecret={clientSecret}
              onSuccess={() => onPurchased(code)}
              onCancel={onClose}
            />
          </div>
        ) : (
          <div className="p-6">
            <div className="flex items-center gap-3.5 pr-10">
              {tier && <SubscriptionMedallion tier={tier} super size={48} />}
              <div>
                <h2 className="text-[20px] font-semibold leading-tight tracking-[-0.02em]">Send a gift</h2>
                <p className="mt-0.5 text-[14px] text-text-muted">First person to claim it gets it.</p>
              </div>
            </div>

            <p className="mb-2 mt-6 text-[12px] font-bold uppercase tracking-[0.02em] text-header-secondary">Plan</p>
            <div role="radiogroup" aria-label="Plan" className="grid gap-2">
              {(["aero", "lite"] as GiftPlan[]).map((p) => {
                const on = plan === p;
                return (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setPlan(p)}
                    className={`flex items-center gap-3 rounded-[3px] border px-3 py-3 text-left transition-colors ${
                      on ? "border-brand bg-interactive-selected" : "border-transparent bg-bg-secondary hover:bg-interactive-hover"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 ${
                        on ? "border-text-normal" : "border-text-muted/50"
                      }`}
                    >
                      {on && <span className="h-2 w-2 rounded-full bg-text-normal" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-medium">{GIFT_PLAN_NAME[p]}</span>
                      <span className="block truncate text-[12px] text-text-muted">{PLAN_BLURB[p]}</span>
                    </span>
                    <span className="shrink-0 text-[14px] tabular-nums text-text-muted">
                      {formatPrice(giftPrice(p, 1))}/mo
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="mb-2 mt-5 text-[12px] font-bold uppercase tracking-[0.02em] text-header-secondary">Length</p>
            <div role="radiogroup" aria-label="Length" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {GIFT_MONTHS.map((m) => {
                const on = months === m;
                const save = savingsPercent(plan, m);
                return (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setMonths(m)}
                    className={`flex flex-col items-center rounded-[3px] border px-2 py-2.5 transition-colors ${
                      on ? "border-brand bg-interactive-selected" : "border-transparent bg-bg-secondary hover:bg-interactive-hover"
                    }`}
                  >
                    <span className="text-[14px] font-medium">{m === 12 ? "1 yr" : `${m} mo`}</span>
                    <span className={`mt-0.5 text-[12px] ${save > 0 ? "text-status-online" : "text-text-muted"}`}>
                      {save > 0 ? `−${save}%` : "—"}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 flex items-baseline justify-between border-t border-bg-tertiary pt-4">
              <span className="text-[14px] text-text-muted">
                {GIFT_PLAN_NAME[plan]} · {monthsLabel(months)}
              </span>
              <span className="text-[22px] font-semibold tabular-nums tracking-[-0.02em]">{formatPrice(price)}</span>
            </div>
            {saving > 0 && (
              <p className="mt-1 text-right text-[12px] text-status-online">
                Saves {saving}% vs. monthly
              </p>
            )}

            {error && <p className="mt-3 text-[14px] text-status-dnd">{error}</p>}

            <div className="-mx-6 -mb-6 mt-5 bg-bg-secondary p-4">
            <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onClose} className="px-3 text-[14px] text-header-primary hover:underline">Cancel</button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void startCheckout()}
              className="h-[38px] rounded-[3px] bg-brand px-3 text-[14px] font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
            >
              {busy ? "Starting checkout…" : `Continue to payment · ${formatPrice(price)}`}
            </button>
            </div>
            <p className="mt-3 text-center text-[12px] leading-relaxed text-text-muted">
              One-off payment. Nothing renews, and the gift can be claimed for a year.
            </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(body, document.body);
}

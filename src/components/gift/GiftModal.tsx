"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { StripeEmbeddedCheckout } from "@/components/subscription/StripeEmbeddedCheckout";
import { apiFetch } from "@/lib/api";
import {
  GIFT_MONTHS, GIFT_PLAN_NAME, formatPrice, giftPrice, monthsLabel, savingsPercent,
  type GiftMonths, type GiftPlan,
} from "@/lib/gifts";
import { SubscriptionMedallion, tierForMonths } from "./SubscriptionMedallion";

/**
 * Buying a gift.
 *
 * Length is a dropdown rather than a row of buttons because a year is the
 * ceiling and four options do not deserve four buttons competing with the
 * plan choice above them. Price is shown for the exact combination chosen —
 * it rises with each step, and the saving against paying monthly is stated
 * rather than left to be worked out.
 */
export function GiftModal({ onClose, onPurchased }: {
  onClose: () => void;
  onPurchased: (code: string) => void;
}) {
  const [plan, setPlan] = useState<GiftPlan>("super");
  const [months, setMonths] = useState<GiftMonths>(1);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accent = plan === "super" ? "#fee75c" : "#57f287";
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

  const body = (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Gift a subscription"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[440px] rounded-2xl bg-bg-secondary shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 rounded p-1.5 text-text-muted transition-colors hover:bg-interactive-hover hover:text-text-normal"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        {clientSecret && code ? (
          <div className="p-6">
            <h2 className="mb-1 text-[19px] font-bold text-text-normal">
              {GIFT_PLAN_NAME[plan]} · {monthsLabel(months)}
            </h2>
            <p className="mb-4 text-[13px] text-text-muted">
              Paying {formatPrice(price)}. You&apos;ll get a link to send once it goes through.
            </p>
            <StripeEmbeddedCheckout
              clientSecret={clientSecret}
              onSuccess={() => onPurchased(code)}
              onCancel={onClose}
            />
          </div>
        ) : (
          <div className="p-6">
            <div className="mb-5 flex items-center gap-3">
              {tier && <SubscriptionMedallion tier={tier} super={plan === "super"} size={52} />}
              <div>
                <h2 className="text-[19px] font-bold leading-tight text-text-normal">
                  Gift a subscription
                </h2>
                <p className="text-[13px] text-text-muted">
                  Send it in a DM or a channel. First to claim it gets it.
                </p>
              </div>
            </div>

            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-text-muted">Plan</p>
            <div className="mb-5 grid grid-cols-2 gap-2">
              {(["basic", "super"] as GiftPlan[]).map((p) => {
                const on = plan === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPlan(p)}
                    className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                      on ? "border-transparent" : "border-divider hover:bg-interactive-hover"
                    }`}
                    style={on ? { background: `${p === "super" ? "#fee75c" : "#57f287"}1f`,
                                  borderColor: p === "super" ? "#fee75c" : "#57f287" } : undefined}
                  >
                    <span className="block text-[15px] font-semibold text-text-normal">
                      {p === "super" ? "Super" : "Basic"}
                    </span>
                    <span className="block text-[12px] text-text-muted">
                      from {formatPrice(giftPrice(p, 1))}
                    </span>
                  </button>
                );
              })}
            </div>

            <label htmlFor="gift-length" className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-text-muted">
              Length
            </label>
            <select
              id="gift-length"
              value={months}
              onChange={(e) => setMonths(Number(e.target.value) as GiftMonths)}
              className="mb-5 w-full rounded-lg border border-divider bg-bg-tertiary px-3 py-2.5 text-[15px] text-text-normal outline-none focus:border-brand"
            >
              {GIFT_MONTHS.map((m) => (
                <option key={m} value={m}>
                  {monthsLabel(m)} — {formatPrice(giftPrice(plan, m))}
                  {savingsPercent(plan, m) > 0 ? ` (save ${savingsPercent(plan, m)}%)` : ""}
                </option>
              ))}
            </select>

            <div className="mb-5 flex items-baseline justify-between rounded-xl bg-bg-tertiary px-4 py-3">
              <span className="text-[13px] text-text-muted">
                {GIFT_PLAN_NAME[plan]}, {monthsLabel(months)}
              </span>
              <span className="text-[20px] font-bold text-text-normal">{formatPrice(price)}</span>
            </div>
            {saving > 0 && (
              <p className="-mt-3 mb-4 text-[12px]" style={{ color: accent }}>
                {saving}% less than {months} months bought one at a time.
              </p>
            )}

            {error && <p className="mb-3 text-[13px] text-status-dnd">{error}</p>}

            <button
              type="button"
              disabled={busy}
              onClick={() => void startCheckout()}
              className="w-full rounded-xl py-3 text-[15px] font-semibold text-[#111] transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ background: accent }}
            >
              {busy ? "Starting…" : `Continue — ${formatPrice(price)}`}
            </button>
            <p className="mt-3 text-center text-[11px] leading-relaxed text-text-muted">
              One-off payment. Nothing renews, and the gift can be claimed for a year.
            </p>
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(body, document.body);
}

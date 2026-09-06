"use client";

import { createPortal } from "react-dom";
import { SubscriptionMedallion, TIERS, tierForMonths, nextTier } from "@/components/gift/SubscriptionMedallion";
import type { SubscriptionPlan } from "@/lib/subscription";

/**
 * What the subscription badge means, opened by clicking it.
 *
 * Shows which plan is held, every tier with the one currently reached raised
 * out of the row, and how much further the next one is — the badge alone can
 * only say "Silver", which does not tell you what Silver is or what comes
 * after it.
 */
export function SubscriptionBadgeModal({
  plan, tenureMonths, since, onClose,
}: {
  plan: Exclude<SubscriptionPlan, "free">;
  tenureMonths: number;
  since: string | null;
  onClose: () => void;
}) {
  const current = tierForMonths(tenureMonths);
  const next = nextTier(tenureMonths);
  const accent = plan === "super" ? "#fee75c" : "#57f287";
  const planName = plan === "super" ? "Disband Super" : "Disband Basic";

  const progress = next && current
    ? Math.min(1, Math.max(0,
        (tenureMonths - current.months) / (next.months - current.months)))
    : 1;

  const body = (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`${planName} subscription badge`}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[620px] overflow-hidden rounded-2xl bg-bg-secondary shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="px-7 pb-6 pt-8 text-center"
          style={{ background: `linear-gradient(180deg, ${accent}1f, transparent)` }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 rounded p-1.5 text-text-muted transition-colors hover:bg-interactive-hover hover:text-text-normal"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>

          <h2 className="text-[24px] font-extrabold leading-tight tracking-[-0.01em] text-text-normal">
            {planName}
          </h2>
          <p className="mt-1.5 text-[14px] text-text-muted">
            The badge changes as the months add up.
          </p>
        </div>

        <div className="px-7 pb-7">
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-5">
            {TIERS.map((t) => {
              const reached = tenureMonths >= t.months;
              const isCurrent = current?.key === t.key;
              return (
                <div
                  key={t.key}
                  className={`w-[84px] rounded-xl px-1 py-2.5 text-center transition-colors ${
                    isCurrent ? "bg-interactive-selected" : ""
                  }`}
                >
                  <div className={reached ? "" : "opacity-30 grayscale"}>
                    <SubscriptionMedallion tier={t} super={plan === "super"} size={58} />
                  </div>
                  <p className="mt-1.5 text-[13px] font-semibold text-text-normal">{t.label}</p>
                  <p className="text-[11px] text-text-muted">
                    {t.months >= 12
                      ? `${t.months / 12} year${t.months > 12 ? "s" : ""}`
                      : `${t.months} months`}
                  </p>
                  {isCurrent && since && (
                    <p className="mt-1 text-[11px] leading-tight text-text-muted">
                      Since {new Date(since).toLocaleDateString()}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-7 rounded-xl bg-bg-tertiary p-4">
            {next ? (
              <>
                <div className="mb-2 flex items-baseline justify-between text-[13px]">
                  <span className="font-semibold text-text-normal">
                    {next.months - tenureMonths} month
                    {next.months - tenureMonths === 1 ? "" : "s"} until {next.label}
                  </span>
                  <span className="text-text-muted">
                    {tenureMonths} / {next.months} months
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-black/30">
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{ width: `${progress * 100}%`, background: accent }}
                  />
                </div>
              </>
            ) : (
              <p className="text-center text-[13px] font-semibold text-text-normal">
                Every tier unlocked — {tenureMonths} months subscribed.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(body, document.body);
}

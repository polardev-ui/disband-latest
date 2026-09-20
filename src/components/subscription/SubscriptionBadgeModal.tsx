"use client";

import { createPortal } from "react-dom";
import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
import {
  SubscriptionMedallion, TIERS, tierForMonths, nextTier, tierDuration,
} from "@/components/gift/SubscriptionMedallion";
import type { SubscriptionPlan } from "@/lib/subscription";

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
  const accent = "#fee75c";
  const planName = "Disband Aero";

  const spanStart = current?.months ?? 0;
  const spanEnd = next?.months ?? spanStart;
  const progress = next
    ? Math.min(1, Math.max(0.02, (tenureMonths - spanStart) / Math.max(1, spanEnd - spanStart)))
    : 1;
  const remaining = next ? next.months - tenureMonths : 0;

  // Always mounted when rendered (no `open` prop).
  useOverlayDismiss(onClose);

  const body = (
    <div
      className="overlay-fade fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-overlay-scrim p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`${planName} subscription badge`}
      onClick={onClose}
    >
      <div
        className="modal-pop relative w-full max-w-[680px] overflow-hidden rounded-2xl bg-bg-secondary shadow-2xl ring-1 ring-divider"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-text-muted transition-colors hover:bg-interactive-hover hover:text-text-normal"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        {}
        <div
          className="flex items-center gap-4 px-7 py-6"
          style={{ background: `linear-gradient(135deg, ${accent}1f, transparent 65%)` }}
        >
          {current && (
            <SubscriptionMedallion tier={current} super size={64} />
          )}
          <div className="min-w-0">
            <h2 className="text-[22px] font-extrabold leading-tight tracking-[-0.01em] text-text-normal">
              {planName}
            </h2>
            <p className="mt-0.5 text-[14px] text-text-muted">
              {current ? `${current.label} · ${monthsLabel(tenureMonths)}` : "Just started"}
              {since && ` · since ${new Date(since).toLocaleDateString()}`}
            </p>
          </div>
        </div>

        {}
        <div className="px-7">
          <div className="rounded-xl bg-bg-tertiary px-4 py-3.5">
            {next ? (
              <>
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <span className="text-[13.5px] font-semibold text-text-normal">
                    {monthsLabel(remaining)} until {next.label}
                  </span>
                  <span className="text-[12px] tabular-nums text-text-muted">
                    {tenureMonths} / {next.months} months
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-bg-accent">
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{ width: `${progress * 100}%`, background: accent }}
                  />
                </div>
              </>
            ) : (
              <p className="text-center text-[13.5px] font-semibold text-text-normal">
                Every tier unlocked — {monthsLabel(tenureMonths)} subscribed.
              </p>
            )}
          </div>
        </div>

        {}
        <div className="grid grid-cols-4 gap-x-2 gap-y-4 px-7 py-6 sm:grid-cols-7">
          {TIERS.map((t) => {
            const reached = tenureMonths >= t.months;
            const isCurrent = current?.key === t.key;
            return (
              <div
                key={t.key}
                className={`flex flex-col items-center rounded-xl px-1 py-2.5 text-center transition-colors ${
                  isCurrent ? "bg-text-normal/10 ring-1 ring-inset" : ""
                }`}
                style={isCurrent ? { borderColor: accent, boxShadow: `inset 0 0 0 1px ${accent}59` } : undefined}
              >
                <span className={reached ? "" : "opacity-25 grayscale"}>
                  <SubscriptionMedallion tier={t} super size={46} />
                </span>
                <p className={`mt-1.5 text-[12.5px] font-semibold ${
                  reached ? "text-text-normal" : "text-text-muted"
                }`}>
                  {t.label}
                </p>
                <p className="text-[11px] leading-tight text-text-muted">{tierDuration(t)}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(body, document.body);
}

function monthsLabel(n: number): string {
  if (n < 12) return `${n} month${n === 1 ? "" : "s"}`;
  const years = Math.floor(n / 12);
  const rest = n % 12;
  const y = `${years} year${years === 1 ? "" : "s"}`;
  if (rest === 0) return y;
  return `${y}, ${rest} month${rest === 1 ? "" : "s"}`;
}

"use client";

import { OVERLAY_Z } from "@/lib/overlay";
import { createPortal } from "react-dom";
import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
import {
  SubscriptionMedallion, TIERS, tierForMonths, nextTier, tierDuration,
} from "@/components/gift/SubscriptionMedallion";
import type { SubscriptionPlan } from "@/lib/subscription";

export function SubscriptionBadgeModal({
  plan, tenureMonths, since, onClose, exiting,
}: {
  plan: Exclude<SubscriptionPlan, "free">;
  tenureMonths: number;
  since: string | null;
  onClose: () => void;
  exiting?: boolean;
}) {
  const current = tierForMonths(tenureMonths);
  const next = nextTier(tenureMonths);
  const accent = current?.base ?? "var(--brand)";
  const planName = plan === "lite" ? "Disband Lite" : "Disband Aero";

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
      className={`overlay-fade${exiting ? " overlay-fade-out" : ""} fixed inset-0 flex items-center justify-center overflow-y-auto bg-overlay-scrim p-4`}
      style={{ zIndex: OVERLAY_Z.badgeDetails }}
      role="dialog"
      aria-modal="true"
      aria-label={`${planName} subscription badge`}
      onClick={onClose}
    >
      <div
        className={`modal-pop${exiting ? " modal-pop-out" : ""} channel-scroll relative max-h-[calc(100dvh-32px)] w-full max-w-[680px] overflow-y-auto rounded-lg bg-bg-primary shadow-[var(--elevation-high)]`}
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
          className="flex items-center gap-4 px-5 py-6 pr-12"
        >
          {current && (
            <SubscriptionMedallion tier={current} super={plan !== "lite"} size={64} />
          )}
          <div className="min-w-0">
            <h2 className="text-[20px] font-semibold leading-tight tracking-[-0.01em] text-text-normal">
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
          <div className="rounded-[4px] bg-bg-tertiary px-4 py-3.5">
            {next ? (
              <>
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <span className="text-[14px] font-semibold text-text-normal">
                    {monthsLabel(remaining)} until {next.label}
                  </span>
                  <span className="text-[12px] tabular-nums text-text-muted">
                    {tenureMonths} / {next.months} months
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-bg-secondary">
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{ width: `${progress * 100}%`, background: accent }}
                  />
                </div>
              </>
            ) : (
              <p className="text-center text-[14px] font-semibold text-text-normal">
                Every tier unlocked — {monthsLabel(tenureMonths)} subscribed.
              </p>
            )}
          </div>
        </div>

        {}
        <div className="grid grid-cols-3 gap-x-2 gap-y-4 px-7 py-6 sm:grid-cols-7">
          {TIERS.map((t) => {
            const reached = tenureMonths >= t.months;
            const isCurrent = current?.key === t.key;
            return (
              <div
                key={t.key}
                className={`flex flex-col items-center rounded-[4px] px-1 py-2.5 text-center transition-colors ${
                  isCurrent ? "bg-bg-secondary" : ""
                }`}
                style={isCurrent ? { borderColor: accent, boxShadow: `inset 0 0 0 1px ${accent}59` } : undefined}
              >
                <span className={reached ? "" : "opacity-25 grayscale"}>
                  <SubscriptionMedallion tier={t} super={plan !== "lite"} size={46} />
                </span>
                <p className={`mt-1.5 text-[12px] font-semibold ${
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

"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";

// Fixed widths so the placeholder doesn't reshuffle between renders.
const DM_WIDTHS = [62, 80, 54, 72, 88, 58, 76, 66, 50, 84];
const ROW_WIDTHS: [number, number][] = [
  [46, 30], [34, 22], [52, 26], [38, 24], [30, 28], [44, 18], [40, 26], [36, 30], [28, 24], [48, 22],
];

function Bar({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skeleton-sweep rounded-full ${className}`} style={style} />;
}

function Block({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skeleton-sweep ${className}`} style={style} />;
}

/** Rows fade in top to bottom, so the screen settles rather than snapping on. */
function rise(i: number): React.CSSProperties {
  return { animationDelay: `${i * 45}ms` };
}

/**
 * Shown while a signed-in session loads its spaces and messages. It has the
 * shape of the real app (rail, 240px column, header, list, user panel) so
 * the swap to live content doesn't jump. One light band sweeps across every
 * block at once because the gradient is pinned to the viewport.
 */
export function AppSkeleton() {
  const { t } = useI18n();
  const [showStatus, setShowStatus] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setShowStatus(true), 4000);
    return () => clearTimeout(id);
  }, []);

  return (
    <div role="status" aria-live="polite" className="relative flex h-full w-full overflow-hidden bg-bg-tertiary">
      <span className="sr-only">{t("Loading Disband")}</span>

      {/* Server rail */}
      <div aria-hidden className="flex w-[72px] shrink-0 flex-col items-center gap-2 pt-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand">
          <img src="/logo.png" alt="" width={28} height={28} className="skeleton-logo h-7 w-7 object-contain brightness-0 invert" />
        </div>
        <div className="my-1 h-0.5 w-8 rounded-full bg-bg-primary" />
        {[0, 1, 2, 3].map((i) => (
          <Block key={i} className="skeleton-rise skeleton-rail h-12 w-12 rounded-full" style={rise(i)} />
        ))}
        <div className="mt-1 h-12 w-12 rounded-full border-2 border-dashed border-bg-primary" />
      </div>

      {/* Channel / DM column */}
      <div aria-hidden className="hidden w-60 shrink-0 flex-col bg-bg-secondary sm:flex">
        <div className="flex h-12 items-center px-2.5 shadow-[var(--elevation-low)]">
          <Block className="h-7 w-full rounded-md" />
        </div>
        <div className="flex flex-col gap-1 px-2 pt-3">
          {[48, 40, 56].map((w, i) => (
            <div key={i} className="skeleton-rise flex h-10 items-center gap-3 px-2" style={rise(i)}>
              <Block className="h-6 w-6 rounded-md" />
              <Bar className="h-3" style={{ width: `${w}%` }} />
            </div>
          ))}
        </div>
        <Bar className="mx-4 mb-2 mt-5 h-2.5 w-24" />
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden px-2">
          {DM_WIDTHS.map((w, i) => (
            <div key={i} className="skeleton-rise flex h-11 shrink-0 items-center gap-3 px-2" style={rise(i + 3)}>
              <Block className="h-8 w-8 shrink-0 rounded-full" />
              <Bar className="h-3" style={{ width: `${w}%` }} />
            </div>
          ))}
        </div>
        {/* User panel */}
        <div className="flex h-[52px] shrink-0 items-center gap-2 bg-bg-secondary-alt px-2">
          <Block className="h-8 w-8 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Bar className="h-2.5 w-20" />
            <Bar className="h-2 w-12" />
          </div>
          {[0, 1, 2].map((i) => (
            <Block key={i} className="h-8 w-8 rounded-md" />
          ))}
        </div>
      </div>

      {/* Main area */}
      <div aria-hidden className="flex min-w-0 flex-1 flex-col bg-bg-primary">
        <div className="flex h-12 shrink-0 items-center gap-3 px-4 shadow-[var(--elevation-low)]">
          <Block className="h-6 w-6 rounded-md" />
          <Bar className="h-3 w-20" />
          <div className="mx-1 h-6 w-px bg-bg-accent" />
          {[56, 44, 64, 52].map((w, i) => (
            <Block key={i} className="hidden h-7 rounded-md md:block" style={{ width: w }} />
          ))}
          <div className="flex-1" />
          <Block className="h-8 w-8 rounded-full" />
        </div>
        <div className="px-6 pt-5">
          <Block className="h-9 w-full rounded-md" />
          <Bar className="mt-6 h-2.5 w-28" />
        </div>
        <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden px-4">
          {ROW_WIDTHS.map(([a, b], i) => (
            <div
              key={i}
              className="skeleton-rise flex h-[62px] shrink-0 items-center gap-3 border-t border-divider px-2"
              style={rise(i)}
            >
              <Block className="h-9 w-9 shrink-0 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Bar className="h-3" style={{ width: `${a}%` }} />
                <Bar className="h-2.5" style={{ width: `${b}%` }} />
              </div>
              <Block className="h-9 w-9 rounded-full" />
              <Block className="h-9 w-9 rounded-full" />
            </div>
          ))}
        </div>
      </div>

      {/* Activity column */}
      <div aria-hidden className="hidden w-[360px] shrink-0 flex-col border-l border-divider bg-bg-primary px-4 pt-4 xl:flex">
        <Bar className="h-4 w-32" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 pb-24">
          <Block className="h-14 w-14 rounded-xl" />
          <Bar className="h-3.5 w-36" />
          <Bar className="h-2.5 w-60" />
          <Bar className="h-2.5 w-44" />
        </div>
      </div>

      {showStatus && (
        <p className="absolute bottom-6 left-1/2 -translate-x-1/2 animate-[tooltip-enter_0.3s_ease-out_forwards] rounded-full bg-bg-floating px-4 py-2 text-center text-xs text-text-muted shadow-lg">
          {t("Connection issues?")}{" "}
          <a href="/status" className="text-brand underline underline-offset-2 transition-colors hover:text-brand-light">
            {t("Check our status")}
          </a>
        </p>
      )}
    </div>
  );
}

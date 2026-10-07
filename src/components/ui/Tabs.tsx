"use client";

import { useRef, type ReactNode } from "react";

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
  /** Shown after the label in a quieter weight, e.g. "Mutual Friends · 3". */
  count?: number;
  disabled?: boolean;
}

/**
 * Underlined text tabs — the house style for switching views inside a card,
 * a profile, or a settings page. Arrow keys move between tabs (the WAI-ARIA
 * tabs pattern), Home/End jump to the ends.
 */
export function UnderlineTabs<T extends string>({
  tabs,
  value,
  onChange,
  className = "",
  idPrefix,
}: {
  tabs: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
  /** Pairs each tab with its panel: tab `${idPrefix}-tab-${id}`, panel `${idPrefix}-panel-${id}`. */
  idPrefix: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = tabs.filter((t) => !t.disabled);

  const move = (from: T, step: number | "first" | "last") => {
    const i = enabled.findIndex((t) => t.id === from);
    const next =
      step === "first" ? 0 : step === "last" ? enabled.length - 1 : (i + step + enabled.length) % enabled.length;
    const target = enabled[next];
    if (!target) return;
    onChange(target.id);
    refs.current[tabs.indexOf(target)]?.focus();
  };

  return (
    <div role="tablist" className={`flex items-end gap-6 border-b border-divider ${className}`}>
      {tabs.map((t, i) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${t.id}`}
            aria-selected={active}
            aria-controls={`${idPrefix}-panel-${t.id}`}
            tabIndex={active ? 0 : -1}
            disabled={t.disabled}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") move(t.id, 1);
              else if (e.key === "ArrowLeft") move(t.id, -1);
              else if (e.key === "Home") move(t.id, "first");
              else if (e.key === "End") move(t.id, "last");
              else return;
              e.preventDefault();
            }}
            className={`relative -mb-px whitespace-nowrap border-b-2 pb-2.5 pt-1 text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              active
                ? "border-text-normal text-text-normal"
                : "border-transparent text-text-muted hover:text-text-normal"
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={active ? "text-text-muted" : "opacity-70"}> · {t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

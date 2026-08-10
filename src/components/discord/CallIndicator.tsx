"use client";

import { useEffect, useState } from "react";
import { IconPhone, IconPhoneOff } from "@/components/icons";
import { getCallIndicatorState, subscribeCallIndicator, type CallIndicatorState } from "@/lib/call-status";

/** 1–3 bars from the browser's network hint, defaulting to good. */
function connectionBars(): number {
  if (typeof navigator === "undefined" || !("connection" in navigator)) return 3;
  const et = (navigator.connection as { effectiveType?: string } | undefined)?.effectiveType;
  if (et === "slow-2g" || et === "2g") return 1;
  if (et === "3g") return 2;
  return 3;
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(m)}:${pad(s)}`;
}

/** Persistent "you're in a call" pill rendered just above the user panel. */
export function CallIndicator() {
  const [state, setState] = useState<CallIndicatorState>(() => getCallIndicatorState());
  const [now, setNow] = useState(() => Date.now());
  const [bars, setBars] = useState(connectionBars);

  useEffect(() => subscribeCallIndicator(() => setState(getCallIndicatorState())), []);

  useEffect(() => {
    if (!state.active || !state.startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state.active, state.startedAt]);

  useEffect(() => {
    if (!state.active) return;
    const id = setInterval(() => setBars(connectionBars()), 5000);
    return () => clearInterval(id);
  }, [state.active]);

  if (!state.active) return null;

  return (
    <div className="shrink-0 border-t border-divider bg-bg-tertiary px-2 py-1.5">
      <div
        role="button"
        tabIndex={state.focus ? 0 : -1}
        onClick={state.focus ?? undefined}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && state.focus) {
            e.preventDefault();
            state.focus();
          }
        }}
        title={state.focus ? "Return to call" : undefined}
        className={`flex w-full items-center gap-2 rounded-lg border border-status-online/30 bg-status-online/10 px-2.5 py-1.5 text-left transition-colors ${
          state.focus ? "cursor-pointer hover:bg-status-online/20" : "cursor-default"
        }`}
      >
        <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-status-online text-white">
          <IconPhone size={14} />
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-status-online ring-2 ring-bg-tertiary" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-semibold leading-tight text-status-online">
            {state.label}
          </span>
          <span className="block text-[11px] leading-tight text-text-muted">
            {state.startedAt ? formatElapsed(Math.max(0, now - state.startedAt)) : "Connecting…"}
          </span>
        </span>

        <span className="flex shrink-0 items-end gap-0.5" title="Connection strength" aria-label="Connection strength">
          {[1, 2, 3].map((i) => (
            <span
              key={i}
              className={`w-0.5 rounded-full ${i <= bars ? "bg-status-online" : "bg-text-muted/30"}`}
              style={{ height: `${4 + i * 3}px` }}
            />
          ))}
        </span>

        {state.hangup && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              state.hangup?.();
            }}
            title="Hang up"
            aria-label="Hang up"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-status-dnd text-white transition-transform hover:scale-110"
          >
            <IconPhoneOff size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import {
  allowedFrameRates, allowedResolutions, getStreamQuality, maxQuality,
  resolutionLabel, setStreamQuality, type FrameRate, type Resolution,
} from "@/lib/stream-quality";
import type { SubscriptionPlan } from "@/lib/subscription";

/**
 * Stream settings, opened from the share button.
 *
 * Options above the plan's ceiling are shown rather than hidden — a free
 * account can see that 4K exists and what it costs, which a truncated list
 * cannot say. They are disabled, not missing.
 */
export function StreamQualityMenu({
  plan, open, onClose, onChange,
}: {
  plan: SubscriptionPlan;
  open: boolean;
  onClose: () => void;
  /** Fired when a setting changes, so a live share can be re-applied. */
  onChange?: () => void;
}) {
  const [quality, setQuality] = useState(() => getStreamQuality(plan));
  const ref = useRef<HTMLDivElement | null>(null);
  const cap = maxQuality(plan);
  const resolutions = allowedResolutions(plan);
  const rates = allowedFrameRates(plan);

  useEffect(() => {
    if (open) setQuality(getStreamQuality(plan));
  }, [open, plan]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  function choose(next: { resolution?: Resolution; fps?: FrameRate }) {
    const merged = { ...quality, ...next };
    setQuality(merged);
    setStreamQuality(merged);
    onChange?.();
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Stream quality"
      className="absolute bottom-full left-1/2 z-50 mb-3 w-64 -translate-x-1/2 overflow-hidden rounded-xl bg-[#111214] py-2 shadow-2xl ring-1 ring-white/10"
    >
      <Section label="Frame Rate" />
      {[15, 30, 60, 120].map((f) => {
        const locked = !rates.includes(f as FrameRate);
        return (
          <Row
            key={f}
            label={`${f} FPS`}
            selected={quality.fps === f}
            locked={locked}
            hint={locked ? lockHint(f > 60 ? "super" : "basic") : undefined}
            onClick={() => choose({ fps: f as FrameRate })}
          />
        );
      })}

      <div className="my-2 h-px bg-white/10" />
      <Section label="Resolution" />
      {[480, 720, 1080, 1440, 2160].map((r) => {
        const locked = !resolutions.includes(r as Resolution);
        return (
          <Row
            key={r}
            label={resolutionLabel(r as Resolution)}
            selected={quality.resolution === r}
            locked={locked}
            hint={locked ? lockHint(r > 1080 ? "super" : "basic") : undefined}
            onClick={() => choose({ resolution: r as Resolution })}
          />
        );
      })}

      <p className="mt-2 border-t border-white/10 px-4 pt-2 text-[11px] leading-relaxed text-text-muted">
        Sharing is free on every plan. Your plan streams up to{" "}
        {resolutionLabel(cap.resolution)} at {cap.fps} FPS.
      </p>
    </div>
  );
}

function lockHint(plan: "basic" | "super"): string {
  return plan === "super" ? "Super" : "Basic";
}

function Section({ label }: { label: string }) {
  return (
    <p className="px-4 pb-1 pt-1.5 text-[15px] font-semibold text-text-muted">{label}</p>
  );
}

function Row({
  label, selected, locked, hint, onClick,
}: {
  label: string;
  selected: boolean;
  locked?: boolean;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={locked}
      onClick={onClick}
      className={`flex w-full items-center justify-between px-4 py-2 text-[15px] transition-colors ${
        locked ? "cursor-not-allowed text-text-muted/50" : "text-text-normal hover:bg-white/5"
      }`}
    >
      <span className="flex items-baseline gap-2">
        {label}
        {hint && <span className="text-[11px] font-semibold uppercase text-brand">{hint}</span>}
      </span>
      <span
        aria-hidden
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
          selected ? "border-brand" : "border-text-muted/40"
        }`}
      >
        {selected && <span className="h-2.5 w-2.5 rounded-full bg-brand" />}
      </span>
    </button>
  );
}

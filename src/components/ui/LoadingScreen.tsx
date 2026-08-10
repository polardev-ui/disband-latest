"use client";

import { useState, useEffect } from "react";
import { Logo } from "@/components/ui/Logo";

/**
 * Full-window splash shown while the session resolves and the first data load
 * settles. Deliberately quiet: a mark, a label, and a thin indeterminate bar —
 * enough to read as "working", without a spinner that draws the eye on every
 * cold start.
 *
 * After 4 seconds, a small "Connection issues? Check our status" link fades in
 * at the bottom, linking to /status.
 */
export function LoadingScreen({ label = "Loading Disband" }: { label?: string }) {
  const [showStatus, setShowStatus] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setShowStatus(true), 4000);
    return () => clearTimeout(id);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex h-screen w-screen flex-col items-center justify-center bg-bg-tertiary"
    >
      <Logo adaptive size={56} className="h-14 w-14 animate-pulse" priority />
      <p className="mt-6 text-sm font-medium text-text-muted">{label}</p>
      <div className="mt-5 h-0.5 w-40 overflow-hidden rounded-full bg-divider">
        <div className="loading-bar h-full w-1/3 rounded-full bg-brand" />
      </div>

      {showStatus && (
        <p className="absolute bottom-8 animate-[tooltip-enter_0.3s_ease-out_forwards] text-center text-xs text-text-muted">
          Connection issues?{" "}
          <a
            href="/status"
            className="text-brand underline underline-offset-2 transition-colors hover:text-brand-light"
          >
            Check our status
          </a>
        </p>
      )}
    </div>
  );
}

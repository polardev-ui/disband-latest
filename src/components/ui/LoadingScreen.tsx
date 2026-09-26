"use client";

import { useState, useEffect } from "react";
import { SplitLogoLoader } from "@/components/ui/SplitLogoLoader";

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
      {/* Sized down from 64: at that size it dominated the screen on a
          short load, which made a fast start feel slower than it was. */}
      <SplitLogoLoader size={44} className="logo-adaptive" />
      <p className="mt-1 text-sm font-medium text-text-muted">{label}</p>

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

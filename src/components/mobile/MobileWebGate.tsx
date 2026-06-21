"use client";

import { useEffect, useState } from "react";
import { isMobileGateDisabled, isMobileUserAgent } from "@/lib/mobile-detect";
import { isTauri } from "@/lib/platform";

export type MobileGateState = "checking" | "redirecting" | "allow";

/** Client-side mobile gate (required when `output: "export"` disables middleware). */
export function useMobileWebGate(): MobileGateState {
  const [state, setState] = useState<MobileGateState>("checking");

  useEffect(() => {
    if (isMobileGateDisabled()) {
      setState("allow");
      return;
    }
    if (isTauri()) {
      setState("allow");
      return;
    }

    const path = window.location.pathname;
    if (/^\/mobile\/?$/i.test(path) || path.startsWith("/mobile/")) {
      setState("allow");
      return;
    }

    if (isMobileUserAgent(navigator.userAgent)) {
      setState("redirecting");
      window.location.replace("/mobile");
      return;
    }

    setState("allow");
  }, []);

  return state;
}

export function MobileGateLoading() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-bg-tertiary text-text-muted">
      Loading…
    </div>
  );
}

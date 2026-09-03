"use client";

import { useEffect, useState } from "react";
import { hasAllowedMobileWeb, isMobileGateDisabled, isMobileUserAgent } from "@/lib/mobile-detect";
import { hasChosenContinueOnWeb } from "@/lib/mobile-session";
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
    if (
      /^\/mobile\/?$/i.test(path)
      || path.startsWith("/mobile/")
      || path.startsWith("/privacy")
      || path.startsWith("/terms")
      // Email links land on a phone more often than not. Bouncing someone to
      // the App Store pitch mid-verification loses the token in the URL.
      || path.startsWith("/verification")
      || path.startsWith("/reset-password")
      || path.startsWith("/bot-invite")
    ) {
      setState("allow");
      return;
    }

    // "Continue on the web" is a standing choice within the current session
    // (in-memory) or a persisted one (localStorage).
    if (hasChosenContinueOnWeb() || hasAllowedMobileWeb()) {
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

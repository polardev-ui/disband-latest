"use client";

import { useState, useEffect } from "react";
import { SplitLogoLoader } from "@/components/ui/SplitLogoLoader";

export function LoadingScreen({ label = "Loading Disband" }: { label?: string }) {
  const [showStatus, setShowStatus] = useState(false);
  const [cached, setCached] = useState(false);

  useEffect(() => {
    let isCached = false;
    try {
      isCached = window.sessionStorage.getItem("disband.loaded") === "1";
      setCached(isCached);
    } catch {
      isCached = false;
    }

    const id = setTimeout(() => setShowStatus(true), 4000);

    // Mark assets as cached after the first successful load so subsequent
    // navigations can skip the full animation.
    const markCached = window.setTimeout(() => {
      try {
        window.sessionStorage.setItem("disband.loaded", "1");
      } catch {
        // Storage may be blocked; ignore.
      }
    }, isCached ? 0 : 1200);

    return () => {
      clearTimeout(id);
      clearTimeout(markCached);
    };
  }, []);

  const timing = cached
    ? { hold: 0, exit: 200, enter: 200, stagger: 20, gap: 40 }
    : undefined;

  return (
    <div
      role="status"
      aria-live="polite"
      className="relative flex h-full w-full flex-col items-center justify-center bg-bg-tertiary"
    >
      {/* Sized down from 64: at that size it dominated the screen on a
          short load, which made a fast start feel slower than it was. */}
      {cached ? (
        <img
          src="/logo.png"
          alt="Disband"
          width={44}
          height={44}
          className="logo-adaptive"
          style={{ width: 44, height: 44, objectFit: "contain" }}
        />
      ) : (
        <SplitLogoLoader size={44} className="logo-adaptive" timing={timing} />
      )}
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

"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useI18n } from "@/contexts/I18nContext";
import { isTauri } from "@/lib/platform";

/**
 * Keeps browser tabs on the current deployment.
 *
 * A tab runs the code it loaded until it is reloaded, so a fix to something
 * like a Realtime subscription never reaches tabs that were left open. This
 * polls /api/version and, once the deployment has moved on, reloads the tab
 * after two minutes without any input. Until then a small notice offers a
 * reload. Desktop has its own updater (UpdateBanner) and is skipped.
 *
 * A reload never interrupts a voice call or a focused iframe (Stripe's card
 * fields), and composer drafts are kept in sessionStorage, so they survive.
 */

const BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? "";
const CHECK_MS = 5 * 60 * 1000;
const IDLE_MS = 2 * 60 * 1000;
const IDLE_POLL_MS = 15 * 1000;

export function WebUpdateWatcher() {
  const { voiceJoinedChannelId } = useApp();
  const { t } = useI18n();
  const [outdated, setOutdated] = useState(false);
  const lastActive = useRef(Date.now());
  const inCall = useRef(false);
  inCall.current = voiceJoinedChannelId !== null;

  useEffect(() => {
    if (!BUILD || isTauri() || outdated) return;
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { build } = (await res.json()) as { build?: string };
        if (!cancelled && build && build !== BUILD) setOutdated(true);
      } catch {
        // Offline or mid-deploy: try again on the next tick.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    const id = setInterval(() => void check(), CHECK_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", check);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", check);
    };
  }, [outdated]);

  useEffect(() => {
    if (!outdated) return;
    const markActive = () => {
      lastActive.current = Date.now();
    };
    const events = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;
    for (const e of events) window.addEventListener(e, markActive, { passive: true });
    const id = setInterval(() => {
      if (Date.now() - lastActive.current < IDLE_MS) return;
      if (inCall.current) return;
      if (document.activeElement?.tagName === "IFRAME") return;
      window.location.reload();
    }, IDLE_POLL_MS);
    return () => {
      for (const e of events) window.removeEventListener(e, markActive);
      clearInterval(id);
    };
  }, [outdated]);

  if (!outdated) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 right-5 z-[200] flex w-[300px] items-center gap-3 rounded-lg border border-divider bg-bg-secondary p-3 shadow-[var(--elevation-high)]"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-text-normal">{t("Disband has updated")}</p>
        <p className="mt-0.5 text-[12px] leading-snug text-text-muted">{t("Reload to get the latest version.")}</p>
      </div>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="shrink-0 rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-brand-hover"
      >
        {t("Reload")}
      </button>
    </div>
  );
}

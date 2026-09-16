"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSkin } from "@/components/theme/SkinProvider";

/**
 * Says why the app suddenly looks ordinary again.
 *
 * A skin is a Super perk, so when a subscription lapses it stops being
 * applied. Doing that silently is the worst version of it: the app changes
 * shape between one launch and the next and nothing anywhere explains it, so
 * it reads as the app breaking rather than as a subscription ending.
 *
 * The saved skin is untouched — it comes straight back on resubscribing —
 * which is what the copy promises, so it had better remain true.
 */
const DISMISS_KEY = "disband:skin-lapsed-ack";

export function SkinLapsedNotice() {
  const { lapsed, plan, loading } = useSkin();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (loading || !lapsed) return;
    try {
      // Acknowledged per plan, so a Super → Basic → free slide says it again
      // rather than staying quiet after the first time.
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === plan);
    } catch {
      setDismissed(false);
    }
  }, [lapsed, plan, loading]);

  if (loading || !lapsed || dismissed) return null;

  const acknowledge = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, plan);
    } catch {
      // Not being able to remember the dismissal is better than not showing it.
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={acknowledge}
        className="absolute inset-0 bg-black/60"
      />
      <div
        role="dialog"
        aria-labelledby="skin-lapsed-title"
        className="relative w-full max-w-md overflow-hidden rounded-xl bg-bg-secondary shadow-2xl ring-1 ring-white/10"
      >
        <div className="border-b border-divider px-6 py-5">
          <h2 id="skin-lapsed-title" className="text-lg font-bold text-text-normal">
            Your theme has been turned off
          </h2>
        </div>

        <div className="space-y-3 px-6 py-5 text-sm leading-relaxed text-text-muted">
          <p>
            Your Disband <span className="font-semibold text-super">Aero</span> subscription
            ended because we could not bill your card, so custom themes are no
            longer active on your account and Disband has gone back to its
            normal appearance.
          </p>
          <p>
            <span className="font-medium text-text-normal">Nothing has been deleted.</span>{" "}
            Your theme, your custom CSS and your uploaded icons are all still
            saved — resubscribe and they come straight back exactly as you left
            them.
          </p>
        </div>

        <div className="flex flex-col gap-2 border-t border-divider px-6 py-4 sm:flex-row-reverse">
          <a
            href="/app?settings=subscriptions"
            onClick={acknowledge}
            className="flex-1 rounded-md bg-brand py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
          >
            Update payment method
          </a>
          <button
            type="button"
            onClick={acknowledge}
            className="flex-1 rounded-md border border-divider py-2.5 text-sm font-semibold text-text-normal transition-colors hover:bg-interactive-hover"
          >
            Not now
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

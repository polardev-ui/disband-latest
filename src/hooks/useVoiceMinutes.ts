"use client";

import { useEffect, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * Counts time spent in a call, which is what the Voice Veteran badge is for.
 *
 * `add_voice_minutes` has existed since the badges shipped — granted to
 * authenticated, security-definer, and it even refreshes the caller's badges
 * itself. Nothing on any platform ever called it, so `profiles.voice_minutes`
 * was zero for every account on the platform and the badge could not be earned
 * at all, however long anyone sat in a channel.
 *
 * Accrued while the call is running rather than only when it ends. The people
 * this badge is for are the ones in eight-hour calls, and a browser that is
 * closed, crashes or is put to sleep never runs a cleanup — so a flush that
 * only happens on leave loses exactly the sessions that would have earned it.
 *
 * The server clamps a single call to 720 minutes and ignores anything below
 * one, so partial minutes are carried rather than dropped: twelve five-minute
 * flushes must add up to an hour, not to zero.
 */

/** Long enough to be a handful of calls an hour, short enough to lose little. */
const FLUSH_INTERVAL_MS = 5 * 60 * 1000;

async function submit(minutes: number): Promise<boolean> {
  if (minutes < 1) return false;
  const { error } = await getSupabaseClient().rpc("add_voice_minutes", {
    p_minutes: Math.min(720, Math.floor(minutes)),
  });
  return !error;
}

export function useVoiceMinutes(active: boolean): void {
  /** When the current stretch of connected time started. */
  const sinceRef = useRef<number | null>(null);
  /** Whole minutes that have not been accepted by the server yet. */
  const carriedRef = useRef(0);

  useEffect(() => {
    if (!active) return;

    sinceRef.current = Date.now();

    const collect = () => {
      const since = sinceRef.current;
      if (since === null) return 0;
      const elapsedMinutes = (Date.now() - since) / 60_000;
      const whole = Math.floor(elapsedMinutes + carriedRef.current);
      // Keep the remainder, so a run of short flushes still totals correctly.
      carriedRef.current = elapsedMinutes + carriedRef.current - whole;
      sinceRef.current = Date.now();
      return whole;
    };

    const flush = () => {
      const minutes = collect();
      if (minutes < 1) return;
      void submit(minutes).then((ok) => {
        // A failed write is carried into the next flush rather than lost.
        if (!ok) carriedRef.current += minutes;
      });
    };

    const timer = window.setInterval(flush, FLUSH_INTERVAL_MS);

    // A tab being hidden or closed is the common way a long call ends, and
    // neither reliably runs the cleanup below.
    const onHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", flush);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", flush);
      flush();
      sinceRef.current = null;
    };
  }, [active]);
}

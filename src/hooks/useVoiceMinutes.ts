"use client";

import { useEffect, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

const FLUSH_INTERVAL_MS = 5 * 60 * 1000;

async function submit(minutes: number): Promise<boolean> {
  if (minutes < 1) return false;
  const { error } = await getSupabaseClient().rpc("add_voice_minutes", {
    p_minutes: Math.min(720, Math.floor(minutes)),
  });
  return !error;
}

export function useVoiceMinutes(active: boolean): void {

  const sinceRef = useRef<number | null>(null);

  const carriedRef = useRef(0);

  useEffect(() => {
    if (!active) return;

    sinceRef.current = Date.now();

    const collect = () => {
      const since = sinceRef.current;
      if (since === null) return 0;
      const elapsedMinutes = (Date.now() - since) / 60_000;
      const whole = Math.floor(elapsedMinutes + carriedRef.current);

      carriedRef.current = elapsedMinutes + carriedRef.current - whole;
      sinceRef.current = Date.now();
      return whole;
    };

    const flush = () => {
      const minutes = collect();
      if (minutes < 1) return;
      void submit(minutes).then((ok) => {

        if (!ok) carriedRef.current += minutes;
      });
    };

    const timer = window.setInterval(flush, FLUSH_INTERVAL_MS);

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

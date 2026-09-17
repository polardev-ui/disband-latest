"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { PRESENCE_CHANNEL, flattenPresenceState } from "@/lib/presence";
import type { RealtimeChannel } from "@supabase/supabase-js";

const POLL_MS = 60_000;
const CONNECT_TIMEOUT_MS = 4_000;

export function LiveOnlineCount() {
  const [count, setCount] = useState<number | null>(null);
  const disposedRef = useRef(false);

  useEffect(() => {
    disposedRef.current = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      let channel: RealtimeChannel | null = null;
      try {
        channel = getSupabaseClient().channel(PRESENCE_CHANNEL);
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, CONNECT_TIMEOUT_MS);
          channel!
            .on("presence", { event: "sync" }, () => {
              if (disposedRef.current || !channel) return;
              const state = channel.presenceState() as Parameters<typeof flattenPresenceState>[0];

              setCount(new Set(flattenPresenceState(state).keys()).size);
            })
            .subscribe((status) => {
              if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
                clearTimeout(timeout);
                resolve();
              }
            });
        });
      } catch {

      } finally {
        if (!disposedRef.current) {
          timer = setTimeout(() => {
            void poll();
          }, POLL_MS);
        }
        await channel?.unsubscribe().catch(() => {});
      }
    };

    void poll();

    return () => {
      disposedRef.current = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return <span>Online — {count === null ? "…" : count}</span>;
}
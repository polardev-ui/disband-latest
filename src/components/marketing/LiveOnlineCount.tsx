"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { PRESENCE_CHANNEL, flattenPresenceState } from "@/lib/presence";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Real "how many people are online right now" for the marketing hero.
 *
 * Reads the same `presence:global` Realtime channel the app itself publishes
 * to, so the count is genuine — every signed-in client tracks its own
 * `{ userId, status }` there, and Realtime drops it the moment the socket
 * dies. Anonymous visitors viewing this page only observe the channel; they
 * never track, so they don't inflate the number.
 *
 * To avoid holding a Realtime socket open for every marketing visitor (free
 * tier has a connection cap), each poll keeps the socket for at most the
 * first sync (or ~4s if the channel is slow) and then re-subscribes every 60s.
 */
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
              // Distinct users: a user with several open devices tracks once.
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
        // Supabase not configured or Realtime unavailable: leave count null.
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
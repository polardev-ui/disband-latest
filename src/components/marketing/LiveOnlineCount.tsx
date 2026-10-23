"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { PRESENCE_CHANNEL, flattenPresenceState } from "@/lib/presence";
import type { RealtimeChannel } from "@supabase/supabase-js";

const RETRY_MS = 60_000;
const INITIAL_SYNC_TIMEOUT_MS = 4_000;

export function LiveOnlineCount({ compact = false }: { compact?: boolean }) {
  const [count, setCount] = useState<number | null>(null);
  const disposedRef = useRef(false);

  useEffect(() => {
    disposedRef.current = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let syncTimer: ReturnType<typeof setTimeout> | undefined;
    let channel: RealtimeChannel | null = null;
    let gotSync = false;

    const readCount = (connected: RealtimeChannel) => {
      if (disposedRef.current) return;
      gotSync = true;
      if (syncTimer) clearTimeout(syncTimer);
      const state = connected.presenceState() as Parameters<typeof flattenPresenceState>[0];
      const visibleUsers = new Set<string>();
      for (const [userId, status] of flattenPresenceState(state)) {
        if (status !== "offline") visibleUsers.add(userId);
      }
      setCount(visibleUsers.size);
    };

    const connect = () => {
      if (disposedRef.current) return;
      let connected: RealtimeChannel;
      try {
        connected = getSupabaseClient().channel(PRESENCE_CHANNEL);
      } catch {
        setCount(0);
        retryTimer = setTimeout(connect, RETRY_MS);
        return;
      }
      channel = connected;
      gotSync = false;

      // Start the fallback before the socket reports SUBSCRIBED. A failed or
      // stalled handshake should show zero, not "Checking…", and a later
      // presence sync still replaces the zero with the real count.
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(() => {
        if (!gotSync && !disposedRef.current && channel === connected) readCount(connected);
      }, INITIAL_SYNC_TIMEOUT_MS);

      connected
        .on("presence", { event: "sync" }, () => readCount(connected))
        .subscribe((status) => {
          if (disposedRef.current || channel !== connected) return;

          if (status === "SUBSCRIBED") return;

          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            channel = null;
            if (syncTimer) clearTimeout(syncTimer);
            void connected.unsubscribe().catch(() => {});
            retryTimer = setTimeout(connect, RETRY_MS);
          }
        });
    };

    connect();

    return () => {
      disposedRef.current = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (syncTimer) clearTimeout(syncTimer);
      const active = channel;
      channel = null;
      if (active) void active.unsubscribe().catch(() => {});
    };
  }, []);

  if (compact) {
    return <span>Online — {count === null ? "…" : count.toLocaleString()}</span>;
  }

  return (
    <span aria-live="polite">
      {count === null
        ? "Checking who's online…"
        : `${count.toLocaleString()} ${count === 1 ? "person" : "people"} online now`}
    </span>
  );
}

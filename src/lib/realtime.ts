import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

/** Wait until a Supabase Realtime channel is actually subscribed before sending. */
export function subscribeChannel(
  channel: RealtimeChannel,
  timeoutMs = 12_000,
): Promise<RealtimeChannel> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error("Realtime channel subscribe timed out"));
    }, timeoutMs);

    channel.subscribe((status, err) => {
      if (status === "SUBSCRIBED") {
        window.clearTimeout(timer);
        resolve(channel);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        window.clearTimeout(timer);
        reject(err ?? new Error(`Realtime channel ${status}`));
      }
    });
  });
}

/** Ephemeral broadcast on a topic (subscribe → send → unsubscribe). */
export async function broadcastOnChannel(
  supabase: SupabaseClient,
  topic: string,
  event: string,
  payload: unknown,
): Promise<void> {
  const channel = supabase.channel(topic, { config: { broadcast: { self: false } } });
  try {
    await subscribeChannel(channel);
    await channel.send({ type: "broadcast", event, payload });
  } finally {
    await channel.unsubscribe();
  }
}

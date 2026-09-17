import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

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

export async function broadcastOnChannel(
  supabase: SupabaseClient,
  topic: string,
  event: string,
  payload: unknown,
): Promise<void> {
  const channel = supabase.channel(topic, {
    config: { broadcast: { self: false, ack: true } },
  });
  try {
    await subscribeChannel(channel);
    const status = await channel.send({ type: "broadcast", event, payload });
    if (status !== "ok") {
      throw new Error(`Realtime broadcast to ${topic} was not acknowledged (${status})`);
    }
  } finally {
    await channel.unsubscribe();
  }
}

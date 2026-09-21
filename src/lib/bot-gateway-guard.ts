import type { SupabaseClient } from "@supabase/supabase-js";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { persistentRateLimitCheck } from "@/lib/auth-guard";

/**
 * Bot gateway rate guard.
 *
 * The v1 bot API previously had no throttling at all: the gateway holds a
 * worker for up to 20s per request with unlimited concurrency, and the list
 * endpoints serve up to 100 rows per call as fast as a token-holder can ask.
 * Bots are long-lived credentials that get pasted into servers and CI logs,
 * so a leaked token must not mean unbounded scraping or worker exhaustion.
 *
 * Limits (per bot unless noted), enforced persistently so they hold across
 * Cloudflare isolates, with the in-memory limiter as a burst pre-filter:
 * - gateway long-poll: 15/min (a 20s hold = ~3 req/min per connection)
 * - reads (list messages/members/channels): 120/min
 * - writes (send/create/rename/delete/leave): 60/min on top of the DB
 *   message-rate triggers
 * - invite creation: 10/min
 * - public invite lookup: 10/min per IP (codes are unguessable; this caps
 *   enumeration + protects the shared anon throttle inside bot_invite_info)
 * - bot registration: 10/day per owner (revoke/recreate loop = auth-user
 *   sprawl otherwise)
 */

export type BotBucket = "gateway" | "read" | "write" | "invite" | "register";

const BUCKET_LIMITS: Record<BotBucket, { max: number; windowSeconds: number }> = {
  gateway: { max: 15, windowSeconds: 60 },
  read: { max: 120, windowSeconds: 60 },
  write: { max: 60, windowSeconds: 60 },
  invite: { max: 10, windowSeconds: 60 },
  register: { max: 10, windowSeconds: 86400 },
};

export function botBucketKey(bucket: BotBucket, id: string): string {
  return `bot:${bucket}:${id}`;
}

export async function checkBotRateLimit(
  service: SupabaseClient | null,
  bucket: BotBucket,
  id: string,
): Promise<{ limited: boolean; retryAfterSeconds: number }> {
  const { max, windowSeconds } = BUCKET_LIMITS[bucket];
  const key = botBucketKey(bucket, id);

  const burstWindow = Math.min(windowSeconds * 1000, 60_000);
  const burstMax = Math.min(max, 20);
  const burst = rateLimit(key, burstMax, burstWindow);
  if (!burst.allowed) return { limited: true, retryAfterSeconds: burst.retryAfterSeconds };

  const hit = await persistentRateLimitCheck(service, [{ key, max, windowSeconds }]);
  if (hit) {
    return { limited: true, retryAfterSeconds: Math.min(windowSeconds, 60) };
  }
  return { limited: false, retryAfterSeconds: 0 };
}

export function botRateLimited(retryAfterSeconds: number): Response {
  return tooManyRequests(retryAfterSeconds);
}

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared helper for login/signup gates.
 * Uses the persistent `platform_rate_limit()` RPC (multi-instance safe on
 * Cloudflare) and treats any RPC failure other than an explicit
 * "Rate limit exceeded" as fail-open for rate limiting itself — the
 * fail-closed behavior for VPN detection lives in `vpn-check.ts`.
 */
export async function persistentRateLimited(
  service: SupabaseClient | null,
  key: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  if (!service) return false;
  const { error } = await service.rpc("platform_rate_limit", {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (!error) return false;
  return /rate limit exceeded/i.test(error.message ?? "");
}

export async function persistentRateLimitCheck(
  service: SupabaseClient | null,
  checks: { key: string; max: number; windowSeconds: number }[],
): Promise<string | null> {
  for (const c of checks) {
    if (await persistentRateLimited(service, c.key, c.max, c.windowSeconds)) {
      return c.key;
    }
  }
  return null;
}

export type AuthGateKind =
  | "login_allowed"
  | "login_rate_limited"
  | "login_vpn_blocked"
  | "login_banned"
  | "signup_rate_limited"
  | "signup_vpn_blocked";

/**
 * Patch 6: failed-login/abuse digest backing. Awaited, never throws —
 * fire-and-forget promises are cancelled by the worker isolate once the
 * response returns, so gates must await this.
 */
export async function logGateEvent(
  service: SupabaseClient | null,
  kind: AuthGateKind,
  ipHash: string | null,
  emailHash: string | null,
): Promise<void> {
  if (!service) return;
  try {
    await service
      .from("auth_gate_events")
      .insert({ kind, ip_hash: ipHash, email_hash: emailHash });
  } catch {
    // Observability must never break the gate.
  }
}

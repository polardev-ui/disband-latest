
export interface VpnCheckResult {
  blocked: boolean;
  unavailable: boolean;
  reason?: string;
}

const vpnCache = new Map<string, { result: boolean; expires: number }>();
const VPN_CACHE_TTL_MS = 10 * 60_000;

function isBypassIp(ip: string): boolean {
  if (!ip || ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1") return true;
  if (ip.startsWith("192.168.") || ip.startsWith("10.")) return true;
  if (ip.startsWith("172.16.") || ip.startsWith("172.31.")) return true;
  if (ip === "unknown") return true;
  return false;
}

async function fetchJson(url: string, timeoutMs = 5000): Promise<{ ok: boolean; data?: unknown }> {
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return { ok: false };
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false };
  }
}

/**
 * Strict VPN/proxy check with fail-closed semantics.
 *
 * - Private/loopback IPs bypass (local dev).
 * - Positive results cached for 10 min to avoid login outages.
 * - If no provider can answer (missing key + fallback down), returns
 *   `{ blocked: true, unavailable: true }` so login/signup gates block
 *   rather than silently allow. Already-authenticated sessions are never
 *   re-checked, so existing users stay signed in.
 */
export async function checkVpnStrict(ip: string): Promise<VpnCheckResult> {
  if (isBypassIp(ip)) return { blocked: false, unavailable: false };

  const cached = vpnCache.get(ip);
  if (cached && cached.expires > Date.now()) {
    return { blocked: cached.result, unavailable: false };
  }

  const apiKey = process.env.IPQUALITYSCORE_API_KEY;
  if (apiKey) {
    const r = await fetchJson(
      `https://ipqualityscore.com/api/json/ip/${apiKey}/${encodeURIComponent(ip)}?strictness=1&allow_public_access_points=false&fast=true`,
    );
    if (r.ok) {
      const data = r.data as { vpn?: boolean; proxy?: boolean; tor?: boolean; active_vpn?: boolean };
      const blocked = !!(data.vpn || data.proxy || data.tor || data.active_vpn);
      vpnCache.set(ip, { result: blocked, expires: Date.now() + VPN_CACHE_TTL_MS });
      return { blocked, unavailable: false };
    }
    // IPQS configured but unreachable — fall through to secondary before failing closed.
  }

  const fallback = await fetchJson(
    `https://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,proxy,hosting`,
  );
  if (fallback.ok) {
    const data = fallback.data as { status?: string; proxy?: boolean; hosting?: boolean };
    if (data.status === "success") {
      const blocked = !!(data.proxy || data.hosting);
      vpnCache.set(ip, { result: blocked, expires: Date.now() + VPN_CACHE_TTL_MS });
      return { blocked, unavailable: false };
    }
  }

  return { blocked: true, unavailable: true, reason: "VPN_DETECTION_UNAVAILABLE" };
}

export async function isVpnOrProxy(ip: string): Promise<boolean> {
  if (isBypassIp(ip)) {
    return false;
  }

  const apiKey = process.env.IPQUALITYSCORE_API_KEY;
  if (apiKey) {
    const r = await fetchJson(
      `https://ipqualityscore.com/api/json/ip/${apiKey}/${encodeURIComponent(ip)}?strictness=1&allow_public_access_points=false&fast=true`,
    );
    if (r.ok) {
      const data = r.data as { vpn?: boolean; proxy?: boolean; tor?: boolean; active_vpn?: boolean };
      return !!(data.vpn || data.proxy || data.tor || data.active_vpn);
    }
  }

  const fallback = await fetchJson(
    `https://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,proxy,hosting`,
  );
  if (!fallback.ok) return false;
  const data = fallback.data as { status?: string; proxy?: boolean; hosting?: boolean };
  if (data.status !== "success") return false;
  return !!(data.proxy || data.hosting);
}

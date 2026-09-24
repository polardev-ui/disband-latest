/**
 * Fail-safe VPN/proxy detection for the auth gates.
 *
 * Design goals (in order):
 *   1. Block real VPN/proxy/TOR egress so abuse botnets can't farm accounts
 *      and bots can't hide behind proxies — the privacy/disaster posture.
 *   2. NEVER let a *flaky provider* become a *global auth outage*. Detection
 *      is a checkpoint, not the product; if the third-party API that answers
 *      "is this a VPN?" is down or rate-limited, that must not silently
 *      strand the legitimate community for hours.
 *
 * To that end, provider resolution is deliberately layered + fail-tolerant:
 *   - IPQualityScore (keyed, strict) is the primary.
 *   - ip-api.com is the fallback. IMPORTANT: its **free** JSON endpoint is
 *     http-only — https returns non-200 on the free tier. We try https first
 *     (paid setups), then http, so the fallback actually answers on free
 *     self-hosting installs.
 *   - All verdicts (including "can't tell today") are cached briefly so a
 *     degraded provider is not re-hammered on every keystroke, and the
 *     per-IP rate caps of the free tier (~45 req/min) don't trip a cascade.
 *
 * Bypass IPs (loopback, private ranges, "unknown") are trusted — matches
 * local dev and self-hosted LAN installs.
 */

export interface VpnCheckResult {
  blocked: boolean;
  /** True when no provider could produce a verdict — the check was
   *  inconclusive rather than a clean pass. Callers decide the posture. */
  unavailable: boolean;
  reason?: string;
}

type VpnVerdict = { blocked: boolean; unavailable: boolean; reason?: string };

// Deterministic short-lived cache. Never caches a "clean" result for long —
// only long enough to smooth bursts — and caches *unavailability* too so a
// down/flaky provider isn't re-hit by every concurrent auth request.
const vpnCache = new Map<string, { verdict: VpnVerdict; expires: number }>();
const VPN_CACHE_TTL_MS = 10 * 60_000; // 10 min — wins vs the 60s burst cap.

async function fetchAny(urls: string[], timeoutMs = 5000): Promise<{ ok: boolean; data?: unknown }> {
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) continue; // non-200 = free-tier https redirect, quota blast — try next
      const data = (await res.json()) as unknown;
      return { ok: true, data };
    } catch {
      continue; // network blip on THIS candidate — next candidate may answer
    }
  }
  return { ok: false };
}

function isCleanVerdict(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { status?: string }).status === "success"
  );
}

function isIpqsVerdict(data: unknown): boolean {
  const d = data as { success?: boolean; vpn?: boolean; proxy?: boolean; tor?: boolean };
  return typeof data === "object" && data !== null && d.success === true;
}

function blockedFromIpqs(data: unknown): boolean {
  const d = data as { vpn?: boolean; proxy?: boolean; tor?: boolean; active_vpn?: boolean };
  return !!(d.vpn || d.proxy || d.tor || d.active_vpn);
}

function blockedFromIpApi(data: unknown): boolean {
  const d = data as { proxy?: boolean; hosting?: boolean };
  return !!(d.proxy || d.hosting);
}

/**
 * Strict check used by the signup/login gates.
 *
 * Returns a verdict object. `unavailable: true` WITHOUT `blocked` means the
 * detection providers were all unreachable/inconclusive. Callers that want a
 * hard wall (signup) can still reject with the "unavailable" messaging; the
 * point of this function is to never CONFLATE "can't reach the detector"
 * with "IP is a VPN" — those are different failures and must not stack into
 * a multi-hour community outage.
 */
export async function checkVpnStrict(ip: string): Promise<VpnCheckResult> {
  if (isBypassIp(ip)) {
    return { blocked: false, unavailable: false };
  }

  const cached = vpnCache.get(ip);
  if (cached && cached.expires > Date.now()) {
    return cached.verdict;
  }

  const apiKey = process.env.IPQUALITYSCORE_API_KEY;

  // Primary: IPQualityScore (strict). A config'd-but-unreachable key is NOT
  // a verdict — fall through to the secondary before deciding anything.
  if (apiKey) {
    const r = await fetchAny([
      `https://ipqualityscore.com/api/json/ip/${apiKey}/${encodeURIComponent(ip)}?strictness=1&allow_public_access_points=false&fast=true`,
    ], 4000);
    if (r.ok && isIpqsVerdict(r.data)) {
      const blocked = blockedFromIpqs(r.data);
      setCache(ip, { blocked, unavailable: false });
      return { blocked, unavailable: false };
    }
    // IPQS answered non-verdict (quota exhausted, requestor blocklisted) or
    // didn't answer — keep walking; a flaky paid key must not ban the wall.
  }

  // Secondary: ip-api.com. Free tier is HTTP-only — try https for paid
  // installs, then http for the common self-host case. Verdicts cached so the
  // ~45 req/min/IP cap doesn't cascade into a fail-closed outage.
  const fallback = await fetchAny([
    `https://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,proxy,hosting`,
    `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,proxy,hosting`,
  ], 4000);
  if (fallback.ok && isCleanVerdict(fallback.data)) {
    const blocked = blockedFromIpApi(fallback.data);
    setCache(ip, { blocked, unavailable: false });
    return { blocked, unavailable: false };
  }

  // Nobody could answer. That is NOT the same as "the IP is a VPN" — report
  // it distinctly and FAIL OPEN: gates must never strand the community
  // because a third-party detector is flaky.
  return { blocked: false, unavailable: true, reason: "VPN_DETECTION_UNAVAILABLE" };
}

/**
 * Coarse bool for non-gate consumers (e.g. moderation/access) that just want
 * "is this IP flagged as a VPN/proxy?" callable from a request path. Fails
 * open: if detection is unavailable we do NOT want a banned-user notice to
 * hinge on a third-party API being up.
 */
export async function isVpnOrProxy(ip: string): Promise<boolean> {
  if (isBypassIp(ip)) return false;

  const apiKey = process.env.IPQUALITYSCORE_API_KEY;
  if (apiKey) {
    const r = await fetchAny([
      `https://ipqualityscore.com/api/json/ip/${apiKey}/${encodeURIComponent(ip)}?strictness=1&allow_public_access_points=false&fast=true`,
    ], 4000);
    if (r.ok && isIpqsVerdict(r.data)) {
      return blockedFromIpqs(r.data);
    }
  }

  const fallback = await fetchAny([
    `https://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,proxy,hosting`,
    `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,proxy,hosting`,
  ], 4000);
  if (fallback.ok && isCleanVerdict(fallback.data)) {
    return blockedFromIpApi(fallback.data);
  }

  return false; // fail open — detector down must not flip this flag
}

function setCache(ip: string, verdict: VpnVerdict): void {
  vpnCache.set(ip, { verdict, expires: Date.now() + VPN_CACHE_TTL_MS });
}

function isBypassIp(ip: string): boolean {
  if (!ip || ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1") return true;
  if (ip.startsWith("192.168.") || ip.startsWith("10.")) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip)) return true;
  if (ip === "unknown") return true;
  return false;
}

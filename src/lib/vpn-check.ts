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
 * The strong-signal subset of the ip-api verdict: `proxy` only.
 *
 * ip-api's `hosting` flag is notoriously noisy on clean egress — carrier NAT,
 * CGNAT, university and corporate pools, some mobile networks all answer
 * `hosting: true` while being ordinary households. It is a *hint*, not proof.
 * `proxy: true` is the field that actually means a forwarding/anonymising hop,
 * so when ip-api is the only provider that answered we trust this subset alone
 * and let the noisy `hosting` hint stand down.
 */
function proxyOnlyFromIpApi(data: unknown): boolean {
  const d = data as { proxy?: boolean };
  return !!d.proxy;
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

  // Ask BOTH providers before weighing anything. Each is given a fair shot and
  // we record what it actually answered — a provider that is quota-exhausted
  // (free IPQS caps at ~35 lookups/day), unreachable, or misconfig'd simply
  // contributes no vote. That unavailability must never masquerade as a block.
  let ipqs: VpnVerdict | undefined;   // answered with a real verdict
  if (apiKey) {
    const r = await fetchAny([
      `https://ipqualityscore.com/api/json/ip/${apiKey}/${encodeURIComponent(ip)}?strictness=1&allow_public_access_points=false&fast=true`,
    ], 4000);
    if (r.ok && isIpqsVerdict(r.data)) {
      ipqs = { blocked: blockedFromIpqs(r.data), unavailable: false };
    }
    // Non-verdict (quota exhausted, caller blocklisted) or no answer: no vote.
    // A flaky paid key must never be the only thing standing between a clean
    // user and their account.
  }

  const fallback = await fetchAny([
    `https://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,proxy,hosting`,
    `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,proxy,hosting`,
  ], 4000);
  let ipApi: VpnVerdict | undefined;   // answered with a real verdict
  if (fallback.ok && isCleanVerdict(fallback.data)) {
    ipApi = { blocked: blockedFromIpApi(fallback.data), unavailable: false };
  }

  // TWO-PROVIDER CONSENSUS: we only hard-block an IP when both detectors
  // independently agree it is a VPN/proxy. A real VPN trips BOTH (IPQS vpn/
  // proxy+tors + ip-api hosting), so bad egress still gets walled. But a lone
  // muddy signal — IPQS past quota, or ip-api's `hosting` flag lighting up on
  // legit shared/CGNAT/carrier pools — can never, on its own, strand clean
  // users. That single-voice false positive is exactly the regression that
  // kept locking out people who aren't on proxies at all, and it is the
  // thing we are killing here for $0.
  if (ipqs && ipApi) {
    const blocked = ipqs.blocked && ipApi.blocked;
    const verdict: VpnVerdict = { blocked, unavailable: false };
    setCache(ip, verdict);
    return verdict;
  }

  // IPQS answered but ip-api did not. IPQS is the authoritative strict
  // detector, so a CLEAN verdict from it stands on its own — that is a
  // definite pass, not an outage, and reporting it as `unavailable` would
  // flag every healthy lookup as a detector failure. A BLOCKED verdict is
  // different: one positive from a single provider is not a conviction, so
  // it degrades to inconclusive and fails open rather than banning on the
  // word of one detector.
  if (ipqs && !ipApi) {
    const verdict: VpnVerdict = ipqs.blocked
      ? { blocked: false, unavailable: true, reason: "VPN_DETECTION_UNAVAILABLE" }
      : { blocked: false, unavailable: false };
    setCache(ip, verdict);
    return verdict;
  }

  // Only the fallback answered (no key, or IPQS down). Its `hosting` flag is
  // notoriously noisy on clean ranges, so alone it may never block — but a
  // plain `proxy` verdict from it IS a strong, real signal we still trust.
  if (!ipqs && ipApi) {
    const blocked = proxyOnlyFromIpApi(fallback.data);
    const verdict: VpnVerdict = { blocked, unavailable: false };
    setCache(ip, verdict);
    return verdict;
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

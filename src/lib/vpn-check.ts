/**
 * Fail-safe VPN/proxy detection for the auth gates.
 *
 * ── POLICY: what this module is allowed to block ────────────────────────────
 *
 * The ONLY egress this module hard-blocks is a confirmed TOR exit. Every other
 * thing a reputation feed can tell us — `vpn`, `proxy`, `hosting`, `active_vpn`,
 * even a high `fraud_score` — is advisory: it is returned as `flagged` for a
 * Cloudflare Turnstile step-up, logged, and NEVER used to refuse someone their
 * account outright.
 *
 * This is deliberately narrow, because the entire "looks anonymised" class is
 * dominated by ordinary people who are NOT on a VPN:
 *
 *   - iCloud Private Relay, which is ON BY DEFAULT for iCloud+ subscribers in
 *     Safari. It is not a VPN the user chose; it appears transparently. And the
 *     two providers *agree* it is risky: IPQS scores a Private Relay exit as
 *     "high risk" (we have seen fraud_score ~84) and sets `vpn: true`, while
 *     ip-api reports the same relay host `hosting: true`. A "two-provider
 *     consensus" therefore still convicts a user who never touched a VPN.
 *   - Carrier-Grade NAT / mobile carrier pools, where one public IP is shared
 *     by dozens-to-hundreds of households and any one of them can sour it.
 *   - University, corporate and public shared NAT.
 *   - People who simply value privacy and run a commercial VPN.
 *
 * Industry guidance is unanimous on the response: do not blanket-block relay /
 * VPN / shared egress; pair layered defences (rate limits, Turnstile, email
 * verification) with step-up verification when *other* risk factors appear.
 * Blocking this class "frustrates legitimate users and does nothing to stop
 * determined fraudsters" (Fingerprint). TOR is the one categorical,
 * non-repudiable signal that is almost never an accident, so it stays.
 *
 * ── Reliability ─────────────────────────────────────────────────────────────
 *
 * Detection is a checkpoint, not the product. Both providers are asked in
 * parallel (a sequential walk used to spend up to 8s inside a login request).
 * If neither can answer, the result is `unavailable` — which callers treat as
 * "we could not tell", never as evidence of a VPN. A third-party quota limit
 * must never become a community-wide auth outage.
 *
 * Bypass IPs (loopback, private ranges, "unknown") are trusted — matches local
 * dev and self-hosted LAN installs.
 */

export interface VpnCheckResult {
  blocked: boolean;
  /**
   * True when the egress *looks* anonymised (VPN/proxy/relay shape) but is not
   * a categorical block. Callers step up to a Cloudflare Turnstile challenge
   * rather than refusing. Never set together with `blocked`.
   */
  flagged: boolean;
  /** True when no provider could produce a verdict — the check was
   *  inconclusive rather than a clean pass. Callers decide the posture. */
  unavailable: boolean;
  reason?: string;
}

type VpnVerdict = { blocked: boolean; flagged: boolean; unavailable: boolean; reason?: string };

// Deterministic short-lived cache, so a burst of logins from one egress (or a
// degraded provider) is not re-hit for every request.
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

interface ProviderAnswer {
  /** The provider returned a real verdict (not a quota/error payload). */
  responded: boolean;
  /** The provider categorically identified a TOR exit. */
  tor: boolean;
  /**
   * The provider sees anonymiser shape — a VPN, proxy, relay or active
   * anonymiser. Not enough to block (see the policy note), but enough to ask
   * for a human-verification challenge.
   */
  anonymizer: boolean;
}

function parseIpqs(data: unknown): ProviderAnswer | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const d = data as {
    success?: boolean;
    tor?: boolean;
    active_tor?: boolean;
    vpn?: boolean;
    proxy?: boolean;
    active_vpn?: boolean;
  };
  if (d.success !== true) return undefined; // over quota / blocklisted caller: no vote
  const tor = d.tor === true || d.active_tor === true;
  return { responded: true, tor, anonymizer: tor || d.vpn === true || d.proxy === true || d.active_vpn === true };
}

function parseIpApi(data: unknown): ProviderAnswer | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const d = data as { status?: string; proxy?: boolean };
  if (d.status !== "success") return undefined;
  // Only the strong `proxy` field counts. `hosting` is deliberately ignored:
  // it is true for carrier/CGNAT/campus pools and iCloud Private Relay, which
  // are exactly the users we must not add friction for.
  return { responded: true, tor: false, anonymizer: d.proxy === true };
}

/**
 * Strict check used by the signup/login gates.
 *
 * Blocks only a categorically-confirmed TOR exit; everything else that merely
 * *looks* anonymised is returned as `flagged` so the caller can step up to a
 * Turnstile challenge (see the policy note at the top of this file).
 * `unavailable: true` without `blocked` means the detectors could not answer at
 * all — callers must fail open on it, because "we could not tell" is not a
 * verdict.
 */
export async function checkVpnStrict(ip: string): Promise<VpnCheckResult> {
  if (isBypassIp(ip)) {
    return { blocked: false, flagged: false, unavailable: false };
  }

  const cached = vpnCache.get(ip);
  if (cached && cached.expires > Date.now()) {
    return cached.verdict;
  }

  const apiKey = process.env.IPQUALITYSCORE_API_KEY;

  // Ask both providers at once. Whoever answers contributes; a provider that is
  // over quota, unreachable, or misconfigured simply contributes nothing.
  const [ipqsRaw, ipApiRaw] = await Promise.all([
    apiKey
      ? fetchAny([
          `https://ipqualityscore.com/api/json/ip/${apiKey}/${encodeURIComponent(ip)}?strictness=1&allow_public_access_points=false&fast=true`,
        ], 4000)
      : Promise.resolve({ ok: false } as const),
    fetchAny([
      `https://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,proxy,hosting`,
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,proxy,hosting`,
    ], 4000),
  ]);

  const ipqs = ipqsRaw.ok ? parseIpqs(ipqsRaw.data) : undefined;
  const ipApi = ipApiRaw.ok ? parseIpApi(ipApiRaw.data) : undefined;

  // Nobody could answer. That is NOT the same as "the IP is a VPN" — report it
  // distinctly and FAIL OPEN: gates must never strand the community because a
  // third-party detector is flaky or over quota.
  if (!ipqs?.responded && !ipApi?.responded) {
    return { blocked: false, flagged: false, unavailable: true, reason: "VPN_DETECTION_UNAVAILABLE" };
  }

  // The one categorical block. A confirmed TOR exit is not Private Relay, not a
  // carrier pool, and not something a member enables by accident.
  if (ipqs?.tor) {
    const verdict: VpnVerdict = { blocked: true, flagged: false, unavailable: false, reason: "tor" };
    setCache(ip, verdict);
    return verdict;
  }

  // Anonymiser-shaped but not categorical: don't refuse the member — flag for a
  // Turnstile step-up so a human can pass while bots are still filtered.
  const flagged = !!(ipqs?.anonymizer || ipApi?.anonymizer);
  const verdict: VpnVerdict = { blocked: false, flagged, unavailable: false };
  setCache(ip, verdict);
  return verdict;
}

/**
 * Coarse bool for non-gate consumers (e.g. the banned-user access notice) that
 * just want "is this IP on anonymising infrastructure?".
 *
 * Broader than the gate on purpose (it only colours a message to an already
 * banned user), but it still drops ip-api's notoriously noisy `hosting` field:
 * carrier NAT, CGNAT, campus/corporate pools and iCloud Private Relay all set
 * `hosting: true` while being perfectly ordinary. Fails open — a detector
 * outage must never flip this flag.
 */
export async function isVpnOrProxy(ip: string): Promise<boolean> {
  if (isBypassIp(ip)) return false;

  const apiKey = process.env.IPQUALITYSCORE_API_KEY;
  if (apiKey) {
    const r = await fetchAny([
      `https://ipqualityscore.com/api/json/ip/${apiKey}/${encodeURIComponent(ip)}?strictness=1&allow_public_access_points=false&fast=true`,
    ], 4000);
    if (r.ok) {
      const d = r.data as { success?: boolean; vpn?: boolean; proxy?: boolean; tor?: boolean; active_vpn?: boolean };
      if (d?.success === true) {
        return !!(d.vpn || d.proxy || d.tor || d.active_vpn);
      }
    }
  }

  const fallback = await fetchAny([
    `https://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,proxy`,
    `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,proxy`,
  ], 4000);
  if (fallback.ok) {
    const d = fallback.data as { status?: string; proxy?: boolean };
    if (d?.status === "success") return !!d.proxy;
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

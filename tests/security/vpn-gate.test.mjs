/**
 * VPN gate regression tests — provider-verdict behaviour.
 *
 * Background (the bugs this locks down): the gate has twice locked out people
 * who were not on a VPN at all.
 *
 *   1. IPQualityScore's free tier caps fast; when it is over quota the gate used
 *      to fall through to ip-api.com, whose `hosting: true` is true for plenty of
 *      perfectly ordinary egress (carrier NAT, CGNAT, campus/corporate pools,
 *      some mobile networks). That single muddy signal hard-blocked the account.
 *
 *   2. Even a *two-provider consensus* does not save this class, because the two
 *      providers agree on people who never chose a VPN: iCloud Private Relay is
 *      default-on for iCloud+ in Safari, IPQS scores a relay exit as "high risk"
 *      and sets `vpn: true`, and ip-api reports the same host `hosting: true`.
 *
 * The rule these tests enforce: the ONLY thing that hard-blocks is a
 * categorically-confirmed TOR exit. Every other annotation — vpn, proxy,
 * hosting, active_vpn, even an agreeing pair — is advisory and must not block.
 * An inconclusive check is never a block either.
 *
 * `fetch` is stubbed so we can drive each provider's exact response, including
 * the over-quota and unreachable cases that only happen in production.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

const moduleUrl = new URL("../../src/lib/vpn-check.ts", import.meta.url).href;

process.env.IPQUALITYSCORE_API_KEY = "test-key";

const { checkVpnStrict } = await import(moduleUrl);

const realFetch = globalThis.fetch;

/** Response shapes the real providers return. */
const IPQS_CLEAN = { success: true, vpn: false, proxy: false, tor: false, active_vpn: false, fraud_score: 0 };
// What a commercial VPN — OR an iCloud Private Relay exit — looks like. IPQS
// itself rates Private Relay "high risk", so this payload is deliberately
// indistinguishable from a real VPN: it must NOT block.
const IPQS_VPN = { success: true, vpn: true, proxy: true, tor: false, active_vpn: true, fraud_score: 84 };
const IPQS_TOR = { success: true, vpn: true, proxy: true, tor: true, active_vpn: true, fraud_score: 100 };
// Over daily quota / blocked caller: HTTP 200 but not a verdict.
const IPQS_QUOTA = { success: false, message: "Exceeded your daily API cap" };

const IPAPI_CLEAN = { status: "success", proxy: false, hosting: false };
// ip-api's noisy field: true on plenty of clean carrier/CGNAT/campus ranges,
// and on iCloud Private Relay.
const IPAPI_HOSTING = { status: "success", proxy: false, hosting: true };
const IPAPI_PROXY = { status: "success", proxy: true, hosting: true };

/**
 * Route stubbed requests to a canned provider behaviour.
 * `ipqs` / `ipApi` may be a payload (answered), or null (unreachable).
 */
function stubProviders({ ipqs, ipApi }) {
  globalThis.fetch = async (url) => {
    const u = String(url);
    const isIpqs = u.includes("ipqualityscore.com");
    const payload = isIpqs ? ipqs : ipApi;
    if (payload === null) throw new Error("simulated network failure");
    return {
      ok: true,
      status: 200,
      json: async () => payload,
    };
  };
}

let ipCounter = 0;
function uniqueIp() {
  // Monotonic, not random: `checkVpnStrict` memoises verdicts in a
  // process-wide Map for 10 minutes, so two tests sharing an IP would read each
  // other's verdict. A counter guarantees a distinct address per call.
  ipCounter += 1;
  return `198.51.${(ipCounter % 250) + 1}.${((ipCounter * 7) % 250) + 1}`;
}

test.afterEach(() => {
  globalThis.fetch = realFetch;
});

test("THE BUG: ip-api alone reporting hosting:true no longer blocks a clean user", async () => {
  // IPQS is over its free-tier quota so it contributes nothing, and ip-api's
  // noisy `hosting` flag is the only signal left. That must NOT be a block.
  stubProviders({ ipqs: IPQS_QUOTA, ipApi: IPAPI_HOSTING });
  const r = await checkVpnStrict(uniqueIp());
  assert.equal(
    r.blocked,
    false,
    "a lone hosting:true from ip-api must never hard-block — it is the false positive that locked out clean users",
  );
});

test("THE BUG (Private Relay): both providers agree it is a VPN/proxy, but it is not a TOR exit — do not block", async () => {
  // This is the exact production failure behind the "it says I have a VPN and I
  // don't" reports: a user on iCloud Private Relay (or a carrier pool, or a
  // privacy VPN). IPQS says vpn+proxy, ip-api says proxy+hosting, and the old
  // two-provider consensus convicted them. The gate must not.
  stubProviders({ ipqs: IPQS_VPN, ipApi: IPAPI_PROXY });
  const r = await checkVpnStrict(uniqueIp());
  assert.equal(
    r.blocked,
    false,
    "two providers agreeing on a non-TOR anonymiser must not wall a legitimate user",
  );
  assert.equal(r.unavailable, false, "both providers answered, so this is a verdict, not an outage");
});

test("ip-api alone reporting proxy:true does not block, but does step up", async () => {
  // With IPQS over quota, ip-api alone cannot convict. Its `proxy` flag is a
  // real anonymiser signal (unlike `hosting`), so it earns a challenge — but
  // never a block, because it still false-positives on some relay ranges.
  stubProviders({ ipqs: null, ipApi: IPAPI_PROXY });
  const r = await checkVpnStrict(uniqueIp());
  assert.equal(r.blocked, false, "a single ip-api proxy verdict must not block");
  assert.equal(r.flagged, true, "it is anonymiser-shaped, so it steps up to a challenge");
});

test("the Private Relay shape is flagged for a Turnstile step-up (not blocked)", async () => {
  // The bug that locked clean users out must become a challenge instead: IPQS
  // vpn/proxy on a network that is not a TOR exit asks for a human check.
  stubProviders({ ipqs: IPQS_VPN, ipApi: null });
  const r = await checkVpnStrict(uniqueIp());
  assert.equal(r.blocked, false);
  assert.equal(r.flagged, true, "anonymiser-shaped egress must step up to a challenge");
});

test("a lone ip-api hosting:true (carrier/CGNAT) is not even flagged", async () => {
  // This is the false-positive class that must get ZERO friction: no block, no
  // challenge — it is ordinary carrier/campus/corporate egress.
  stubProviders({ ipqs: IPQS_QUOTA, ipApi: IPAPI_HOSTING });
  const r = await checkVpnStrict(uniqueIp());
  assert.equal(r.blocked, false);
  assert.equal(r.flagged, false, "noisy hosting alone must never demand verification");
});

test("a confirmed TOR exit is blocked and never flagged", async () => {
  stubProviders({ ipqs: IPQS_TOR, ipApi: IPAPI_CLEAN });
  const r = await checkVpnStrict(uniqueIp());
  assert.equal(r.blocked, true);
  assert.equal(r.flagged, false, "flagged means challenge, not block — the two are exclusive");
});

test("a clean verdict is neither blocked nor flagged", async () => {
  stubProviders({ ipqs: IPQS_CLEAN, ipApi: IPAPI_CLEAN });
  const r = await checkVpnStrict(uniqueIp());
  assert.equal(r.blocked, false);
  assert.equal(r.flagged, false);
});

test("an inconclusive check is neither blocked nor flagged", async () => {
  stubProviders({ ipqs: null, ipApi: null });
  const r = await checkVpnStrict(uniqueIp());
  assert.equal(r.blocked, false);
  assert.equal(r.flagged, false, "we could not tell is not a reason to add friction");
});

test("IPQS alone reporting a VPN (ip-api unreachable) is advisory, not a block", async () => {
  stubProviders({ ipqs: IPQS_VPN, ipApi: null });
  const r = await checkVpnStrict(uniqueIp());
  assert.equal(r.blocked, false, "a lone IPQS VPN verdict must not block");
  assert.equal(r.unavailable, false, "IPQS answered, so this is a clean-ish verdict, not an outage");
});

test("IPQS alone reporting clean is a definite pass", async () => {
  stubProviders({ ipqs: IPQS_CLEAN, ipApi: null });
  const r = await checkVpnStrict(uniqueIp());
  assert.equal(r.blocked, false);
  assert.equal(r.unavailable, false, "a clean verdict from a real provider is a pass, not an outage");
});

test("a confirmed TOR exit is still blocked — the one categorical signal", async () => {
  stubProviders({ ipqs: IPQS_TOR, ipApi: IPAPI_CLEAN });
  const r = await checkVpnStrict(uniqueIp());
  assert.equal(r.blocked, true, "TOR egress must remain walled");
  assert.equal(r.unavailable, false);
  assert.equal(r.reason, "tor");
});

test("a confirmed TOR exit blocks even when ip-api is unreachable", async () => {
  stubProviders({ ipqs: IPQS_TOR, ipApi: null });
  const r = await checkVpnStrict(uniqueIp());
  assert.equal(r.blocked, true, "TOR is categorical and stands on IPQS alone");
  assert.equal(r.unavailable, false);
});

test("both providers unreachable is unavailable, never a block", async () => {
  stubProviders({ ipqs: null, ipApi: null });
  const r = await checkVpnStrict(uniqueIp());
  assert.equal(r.blocked, false, "a total detector outage must fail open");
  assert.equal(r.unavailable, true);
});

test("IPQS over quota with no ip-api answer is unavailable, never a block", async () => {
  stubProviders({ ipqs: IPQS_QUOTA, ipApi: null });
  const r = await checkVpnStrict(uniqueIp());
  assert.equal(r.blocked, false);
  assert.equal(r.unavailable, true);
  assert.equal(r.reason, "VPN_DETECTION_UNAVAILABLE");
});

test("never returns blocked:true together with unavailable:true", async () => {
  // Callers 403 on `blocked`. The old code could hand them a hard 403 with
  // "temporarily unavailable" messaging, stranding the community. This
  // combination must be impossible.
  const cases = [
    { ipqs: IPQS_QUOTA, ipApi: IPAPI_HOSTING },
    { ipqs: IPQS_VPN, ipApi: null },
    { ipqs: null, ipApi: null },
    { ipqs: IPQS_QUOTA, ipApi: null },
    { ipqs: IPQS_VPN, ipApi: IPAPI_PROXY },
    { ipqs: IPQS_CLEAN, ipApi: IPAPI_CLEAN },
    { ipqs: IPQS_TOR, ipApi: null },
    { ipqs: IPQS_TOR, ipApi: IPAPI_PROXY },
  ];
  for (const c of cases) {
    stubProviders(c);
    const r = await checkVpnStrict(uniqueIp());
    if (r.unavailable) {
      assert.equal(
        r.blocked,
        false,
        `inconclusive must never pair with blocked (${JSON.stringify(c)})`,
      );
    }
  }
});

test("bypass IPs are trusted", async () => {
  // No provider should even be consulted for loopback/private ranges.
  globalThis.fetch = async () => {
    throw new Error("fetch must not be called for a bypass IP");
  };
  for (const ip of ["127.0.0.1", "::1", "10.1.2.3", "192.168.0.9", "172.16.5.5", "unknown", ""]) {
    const r = await checkVpnStrict(ip);
    assert.equal(r.blocked, false);
    assert.equal(r.unavailable, false);
  }
});

/**
 * VPN gate regression tests — provider-verdict behaviour.
 *
 * Background (the bug this locks down): IPQualityScore's free tier is capped
 * at ~35 lookups/day. When the cap is hit IPQS answers non-verdict, the gate
 * falls through to ip-api.com, and ip-api's free tier reports `hosting: true`
 * for a large amount of perfectly ordinary egress (carrier NAT, CGNAT,
 * university/corporate pools, some mobile networks). The old code treated that
 * single muddy signal as proof of abuse and hard-blocked the account, so people
 * who were not on a VPN at all could not sign up or sign in.
 *
 * The rule these tests enforce: a block requires TWO independent providers to
 * agree, and an inconclusive check is never a block.
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
const IPQS_CLEAN = { success: true, vpn: false, proxy: false, tor: false, active_vpn: false };
const IPQS_VPN = { success: true, vpn: true, proxy: true, tor: false, active_vpn: true };
// Over daily quota / blocked caller: HTTP 200 but not a verdict.
const IPQS_QUOTA = { success: false, message: "Exceeded your daily API cap" };

const IPAPI_CLEAN = { status: "success", proxy: false, hosting: false };
// ip-api's noisy field: true on plenty of clean carrier/CGNAT/campus ranges.
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

function uniqueIp() {
  return `203.0.113.${Math.floor(Math.random() * 250) + 1}`;
}

test.afterEach(() => {
  globalThis.fetch = realFetch;
});

test("THE BUG: ip-api alone reporting hosting:true no longer blocks a clean user", async () => {
  // This is the exact production failure: IPQS is over its free-tier quota so
  // it contributes nothing, and ip-api's noisy `hosting` flag is the only
  // signal left. That must NOT be a block.
  stubProviders({ ipqs: IPQS_QUOTA, ipApi: IPAPI_HOSTING });
  const r = await checkVpnStrict(uniqueIp());
  assert.equal(
    r.blocked,
    false,
    "a lone hosting:true from ip-api must never hard-block — it is the false positive that locked out clean users",
  );
});

test("a real VPN detected by BOTH providers is still blocked", async () => {
  stubProviders({ ipqs: IPQS_VPN, ipApi: IPAPI_PROXY });
  const r = await checkVpnStrict(uniqueIp());
  assert.equal(r.blocked, true, "genuine VPN/proxy egress must remain walled");
  assert.equal(r.unavailable, false);
});

test("two-provider consensus: one clean provider outvotes one blocked provider", async () => {
  // IPQS says VPN, ip-api says clean. Consensus is not reached, so allow —
  // a single provider's positive is not enough to convict.
  stubProviders({ ipqs: IPQS_VPN, ipApi: IPAPI_CLEAN });
  const r = await checkVpnStrict(uniqueIp());
  assert.equal(r.blocked, false, "one provider's positive must not convict alone");
});

test("two-provider consensus: both hosting AND vpn is a block", async () => {
  stubProviders({ ipqs: IPQS_VPN, ipApi: IPAPI_HOSTING });
  const r = await checkVpnStrict(uniqueIp());
  assert.equal(r.blocked, true, "when both agree the IP is bad, block it");
});

test("IPQS alone (ip-api unreachable) is inconclusive, not a block", async () => {
  // Only IPQS answered. One voice is not a conviction.
  stubProviders({ ipqs: IPQS_VPN, ipApi: null });
  const r = await checkVpnStrict(uniqueIp());
  assert.equal(r.blocked, false, "a lone IPQS verdict must not block on its own");
  assert.equal(r.unavailable, true, "a single voice is reported as inconclusive");
  assert.equal(r.reason, "VPN_DETECTION_UNAVAILABLE");
});

test("IPQS alone reporting clean is a definite pass", async () => {
  stubProviders({ ipqs: IPQS_CLEAN, ipApi: null });
  const r = await checkVpnStrict(uniqueIp());
  assert.equal(r.blocked, false);
  assert.equal(r.unavailable, false, "a clean verdict from a real provider is a pass, not an outage");
});

test("ip-api alone reporting proxy:true still blocks (strong signal, trusted)", async () => {
  // No IPQS key path: when only ip-api answers, `proxy` is a real anonymising
  // hop and is still grounds to block on its own.
  stubProviders({ ipqs: null, ipApi: IPAPI_PROXY });
  const r = await checkVpnStrict(uniqueIp());
  assert.equal(r.blocked, true, "a plain proxy verdict must still be enforced");
});

test("both providers unreachable is unavailable, never a block", async () => {
  stubProviders({ ipqs: null, ipApi: null });
  const r = await checkVpnStrict(uniqueIp());
  assert.equal(r.blocked, false, "a total detector outage must fail open");
  assert.equal(r.unavailable, true);
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

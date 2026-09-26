/**
 * Raffle delivery tracking and email content.
 *
 * The question this exists to answer is "was the email actually delivered to
 * the winner, or did it just leave our API?". An accepted send is not delivery:
 * the address can bounce a minute later, and the owner has to be told the real
 * outcome. So the mapping from the mail provider's event to the recorded status
 * is tested directly, including the case that matters most operationally — the
 * provider is unreachable and the last known status must survive untouched.
 */

import { registerHooks } from "node:module";

// src/lib/supabase/server.ts starts with `import "server-only"`, a build-time
// marker that is not installed in this repo. Stub it so the module loads here;
// the guard is a bundler concern, not runtime behaviour.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,export{}", shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

const SUPABASE_URL = "https://project.supabase.co";

process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
process.env.RESEND_API_KEY = "resend-key";

const { getResendEmailStatus } = await import("@/lib/resend");
const {
  getRaffleConfig,
  refreshDeliveryStatus,
  buildWinnerEmailHtml,
  buildOwnerReportHtml,
} = await import("@/lib/raffle");

/** Calls captured per test so assertions can inspect what was actually sent. */
let resendResponses = new Map();
let recordedDeliveries = [];
let rpcFailures = new Map();

/**
 * The stubbed draw row's delivery status, updated when the stub accepts a
 * raffle_record_delivery write. Without this the re-read after the write would
 * return the pre-write value and every "was it recorded?" assertion would pass
 * or fail for the wrong reason.
 */
let currentDeliveryStatus = "accepted";

const realFetch = globalThis.fetch;

function installFetch() {
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    const method = (init?.method ?? "GET").toUpperCase();

    // --- Mail provider: status lookup -----------------------------------
    const statusMatch = url.match(/api\.resend\.com\/emails\/(.+)$/);
    if (statusMatch && method === "GET") {
      const id = decodeURIComponent(statusMatch[1]);
      if (!resendResponses.has(id)) {
        return new Response(JSON.stringify({ message: "not found" }), { status: 404 });
      }
      const body = resendResponses.get(id);
      if (body === "__network_error__") throw new TypeError("fetch failed");
      if (body === "__server_error__") {
        return new Response("nope", { status: 500 });
      }
      return new Response(JSON.stringify({ id, ...body }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // --- Mail provider: send --------------------------------------------
    if (url.startsWith("https://api.resend.com/emails") && method === "POST") {
      return new Response(JSON.stringify({ id: "sent_id_1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // --- PostgREST: RPC --------------------------------------------------
    const rpcMatch = url.match(/\/rest\/v1\/rpc\/(\w+)$/);
    if (rpcMatch) {
      const name = rpcMatch[1];
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (rpcFailures.has(name)) {
        return new Response(JSON.stringify({ message: rpcFailures.get(name) }), { status: 400 });
      }
      if (name === "raffle_record_delivery") {
        recordedDeliveries.push(body);
        // Storage keeps only forward progress, like raffle_record_delivery().
        if (!["bounced", "complained", "failed"].includes(currentDeliveryStatus)) {
          currentDeliveryStatus = body.p_status;
        }
        return new Response("[]", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("[]", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // --- PostgREST: table read ------------------------------------------
    if (url.includes("/rest/v1/raffle_draws")) {
      const row = {
        id: "draw-1",
        prize: "playstation5-or-600",
        status: "drawn",
        promo_start: "2026-09-26T00:00:00Z",
        promo_end: "2026-12-15T12:00:00Z",
        winner_user_id: "user-1",
        runner_up_user_id: "user-2",
        winner_email: "winner@example.com",
        runner_up_email: "runner@example.com",
        winner_entries: 3,
        runner_up_entries: 2,
        drawn_at: "2026-12-15T12:05:00Z",
        response_deadline: "2026-12-22T12:05:00Z",
        winner_email_id: "email_123",
        winner_delivery_status: currentDeliveryStatus,
        winner_delivery_checked_at: "2026-12-15T12:05:10Z",
        winner_delivery_detail: null,
        claimed_at: null,
        prize_choice: null,
        created_at: "2026-09-26T00:00:00Z",
      };
      // maybeSingle() asks for a single object rather than an array.
      const wantsObject = (init?.headers ?? {})["Accept"] === "application/vnd.pgrst.object+json"
        || Object.entries(init?.headers ?? {}).some(
          ([k, v]) => k.toLowerCase() === "accept" && v === "application/vnd.pgrst.object+json",
        );
      return new Response(JSON.stringify(wantsObject ? row : [row]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.includes("/rest/v1/raffle_entries")) {
      return new Response(
        JSON.stringify([
          { user_id: "user-1", username: "winner", entries: 3, review_entries: 1, referral_entries: 2, verified_referrals: 4 },
          { user_id: "user-2", username: "runner", entries: 2, review_entries: 0, referral_entries: 2, verified_referrals: 4 },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    throw new Error(`Unexpected fetch in test: ${method} ${url}`);
  };
}

before(() => installFetch());
after(() => {
  globalThis.fetch = realFetch;
});

beforeEach(() => {
  resendResponses = new Map();
  recordedDeliveries = [];
  rpcFailures = new Map();
  currentDeliveryStatus = "accepted";
});

test("the config defaults to the published draw date and can be overridden", () => {
  const prior = process.env.RAFFLE_DRAW_AT;
  delete process.env.RAFFLE_DRAW_AT;
  delete process.env.RAFFLE_PROMO_START;
  delete process.env.RAFFLE_PROMO_END;

  const defaults = getRaffleConfig();
  assert.equal(defaults.drawAt, "2026-12-15T12:00:00.000Z", "drawn on the 15th");
  assert.equal(defaults.promoEnd, defaults.drawAt, "the window closes at the draw");

  process.env.RAFFLE_DRAW_AT = "2027-01-01T00:00:00.000Z";
  process.env.RAFFLE_PROMO_START = "2026-10-01T00:00:00.000Z";
  const overridden = getRaffleConfig();
  assert.equal(overridden.drawAt, "2027-01-01T00:00:00.000Z");
  assert.equal(overridden.promoStart, "2026-10-01T00:00:00.000Z");

  if (prior === undefined) delete process.env.RAFFLE_DRAW_AT;
  else process.env.RAFFLE_DRAW_AT = prior;
});

test("a delivered email is recorded as delivered", async () => {
  resendResponses.set("email_123", { last_event: "delivered", to: ["winner@example.com"] });
  const result = await refreshDeliveryStatus("draw-1");
  assert.equal(result.status, "delivered");
  assert.equal(result.checked, true);
  assert.equal(recordedDeliveries.length, 1);
  assert.equal(recordedDeliveries[0].p_status, "delivered");
  assert.equal(recordedDeliveries[0].p_draw_id, "draw-1");
});

test("a bounce is recorded as bounced, not as sent", async () => {
  resendResponses.set("email_123", { last_event: "bounced", to: ["winner@example.com"] });
  const result = await refreshDeliveryStatus("draw-1");
  assert.equal(result.status, "bounced");
  assert.equal(recordedDeliveries[0].p_status, "bounced");
});

test("being opened counts as delivered", async () => {
  // An open can only happen after the message reached an inbox.
  resendResponses.set("email_123", { last_event: "opened", to: ["winner@example.com"] });
  const result = await refreshDeliveryStatus("draw-1");
  assert.equal(result.status, "delivered");
  assert.equal(recordedDeliveries[0].p_status, "delivered");
});

test("an in-flight event stays accepted and is not mistaken for delivery", async () => {
  resendResponses.set("email_123", { last_event: "delivery_delayed", to: ["winner@example.com"] });
  const result = await refreshDeliveryStatus("draw-1");
  assert.equal(result.status, "accepted", "delayed is not delivered");
  assert.notEqual(result.status, "delivered");
});

test("a provider outage does not overwrite the last known status", async () => {
  // The important one: an unreachable provider must not turn a known bounce
  // back into a vague "accepted" and hide a broken address from the owner.
  resendResponses.set("email_123", "__network_error__");
  const result = await refreshDeliveryStatus("draw-1");
  assert.equal(result.checked, false);
  assert.equal(result.status, "accepted", "keeps whatever was last recorded");
  assert.equal(recordedDeliveries.length, 0, "nothing is written when the answer is unknown");
});

test("a provider 500 does not overwrite the last known status", async () => {
  resendResponses.set("email_123", "__server_error__");
  const result = await refreshDeliveryStatus("draw-1");
  assert.equal(result.checked, false);
  assert.equal(recordedDeliveries.length, 0);
});

test("an unknown email id is not reported as a delivery", async () => {
  // No entry in the map -> the provider 404s.
  const result = await refreshDeliveryStatus("draw-1");
  assert.equal(result.checked, false);
  assert.equal(recordedDeliveries.length, 0);
});

test("an unrecognised provider event is surfaced, not guessed at", async () => {
  resendResponses.set("email_123", { last_event: "quantum_superposition", to: ["winner@example.com"] });
  const result = await refreshDeliveryStatus("draw-1");
  assert.equal(result.checked, false);
  assert.equal(recordedDeliveries.length, 0);
});

test("the raw status reader normalises events and survives a bad id", async () => {
  resendResponses.set("email_abc", { last_event: "DELIVERED", to: "a@b.dev" });
  const status = await getResendEmailStatus("email_abc");
  assert.equal(status?.lastEvent, "delivered", "case is normalised");
  assert.deepEqual(status?.to, ["a@b.dev"], "a bare string is normalised to a list");

  assert.equal(await getResendEmailStatus("does_not_exist"), null);
});

test("a storage failure is raised rather than swallowed", async () => {
  resendResponses.set("email_123", { last_event: "delivered", to: ["winner@example.com"] });
  rpcFailures.set("raffle_record_delivery", "boom");
  await assert.rejects(() => refreshDeliveryStatus("draw-1"), /Could not record the delivery status/);
});

test("the winner email states the prize, the deadline and the never-ask rule", () => {
  const html = buildWinnerEmailHtml({
    username: "winner",
    deadline: "2026-12-22T12:05:00Z",
  });
  assert.match(html, /PlayStation 5/);
  assert.match(html, /\$600/);
  assert.match(html, /gift card/i);
  assert.match(html, /22 Dec 2026 12:05:00 GMT/, "the exact deadline is stated");
  assert.match(html, /shipping name and address/i);
  assert.match(html, /runner-up/i, "the fallback is disclosed");
  assert.match(html, /never ask you for your password/i, "the anti-scam line ships with the win");
});

test("the owner report names the winner, the runner-up and the pool", () => {
  const html = buildOwnerReportHtml({
    draw: {
      id: "draw-1",
      prize: "playstation5-or-600",
      status: "drawn",
      promo_start: "2026-09-26T00:00:00Z",
      promo_end: "2026-12-15T12:00:00Z",
      winner_user_id: "user-1",
      runner_up_user_id: "user-2",
      winner_email: "winner@example.com",
      runner_up_email: "runner@example.com",
      winner_entries: 3,
      runner_up_entries: 2,
      drawn_at: "2026-12-15T12:05:00Z",
      response_deadline: "2026-12-22T12:05:00Z",
      winner_email_id: "email_123",
      winner_delivery_status: "accepted",
      winner_delivery_checked_at: null,
      winner_delivery_detail: null,
      claimed_at: null,
      prize_choice: null,
      created_at: "2026-09-26T00:00:00Z",
    },
    winner: { username: "winner", email: "winner@example.com", entries: 3 },
    runnerUp: { username: "runner", email: "runner@example.com", entries: 2 },
    pool: [
      { user_id: "user-1", username: "winner", entries: 3, review_entries: 1, referral_entries: 2, verified_referrals: 4, review_id: null, review_recorded_at: null },
      { user_id: "user-2", username: "runner", entries: 2, review_entries: 0, referral_entries: 2, verified_referrals: 4, review_id: null, review_recorded_at: null },
    ],
  });

  assert.match(html, /winner@example\.com/, "the owner can act on the address");
  assert.match(html, /runner@example\.com/, "the fallback person is named too");
  assert.match(html, /2 entrants, 5 tickets/, "pool size and ticket count");
  assert.match(html, /1 review entries, 4 referral entries/, "the review/referral split is counted, not guessed from the entrant count");
  assert.match(html, /22 Dec 2026 12:05:00 GMT/, "the deadline is stated");
});

test("the owner report leads with a lost-prize alert when the winner was not emailed", () => {
  const base = {
    draw: {
      id: "draw-1", prize: "playstation5-or-600", status: "drawn",
      promo_start: "2026-09-26T00:00:00Z", promo_end: "2026-12-15T12:00:00Z",
      winner_user_id: "user-1", runner_up_user_id: "user-2",
      winner_email: "winner@example.com", runner_up_email: "runner@example.com",
      winner_entries: 3, runner_up_entries: 2,
      drawn_at: "2026-12-15T12:05:00Z", response_deadline: "2026-12-22T12:05:00Z",
      winner_email_id: null, winner_delivery_status: "not_sent",
      winner_delivery_checked_at: null, winner_delivery_detail: null,
      claimed_at: null, prize_choice: null, created_at: "2026-09-26T00:00:00Z",
    },
    winner: { username: "winner", email: "winner@example.com", entries: 3 },
    runnerUp: { username: "runner", email: "runner@example.com", entries: 2 },
    pool: [
      { user_id: "user-1", username: "winner", entries: 3, review_entries: 1, referral_entries: 2, verified_referrals: 4, review_id: null, review_recorded_at: null },
    ],
  };

  const failed = buildOwnerReportHtml({
    ...base,
    winnerEmail: { emailId: null, sent: false, error: "provider is down" },
  });
  assert.match(failed, /winner was NOT emailed/i);
  assert.match(failed, /provider is down/, "the reason is on the email");
  assert.match(failed, /"action":"resend"/, "and the fix");

  const sent = buildOwnerReportHtml({ ...base, winnerEmail: { emailId: "e1", sent: true } });
  assert.ok(!/NOT emailed/.test(sent), "no false alarm on a clean run");

  const recorded = buildOwnerReportHtml({
    ...base,
    winnerEmail: { emailId: "e1", sent: true, error: "id could not be recorded" },
  });
  assert.match(recorded, /email was sent, but:/i, "a lesser problem is not escalated");
  assert.ok(!/NOT emailed/.test(recorded));
});

test("email content escapes the values it interpolates", () => {
  const html = buildWinnerEmailHtml({
    username: '<img src=x onerror="alert(1)">',
    deadline: "2026-12-22T12:05:00Z",
  });
  assert.ok(!html.includes("<img src=x"), "no raw tag from a username");
  assert.match(html, /&lt;img/, "the username is escaped instead");
  assert.ok(!html.includes('onerror="alert(1)"'), "no live handler reaches the markup");
});

/**
 * The draw flow end to end: draw, notify the winner, notify the owner.
 *
 * The scenario these exist for is the one that loses a prize. The draw is
 * committed to the database in a single transaction and will never leave
 * `drawn` again, so anything that fails *after* that point — a mail provider
 * outage, a misconfigured sender, an account with no address — cannot be
 * retried by simply running the draw again. The only recovery is the owner
 * knowing it happened. So the contract is: the draw never throws after
 * committing, and the owner is always emailed with the failure stated on it.
 */

import { registerHooks } from "node:module";

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
process.env.RAFFLE_ADMIN_EMAIL = "polar@example.com";
process.env.RAFFLE_DRAW_AT = "2026-12-15T12:00:00.000Z";

const { runDraw, resendWinnerEmail } = await import("@/lib/raffle");

// Mutable stub state.
let drawStatus = "open";
let winnerEmailAddress = "winner@example.com";
let failSendToWinner = false;
let markSentFails = false;
let sentEmails = [];
let sendAttempts = [];
let drawCallCount = 0;

const realFetch = globalThis.fetch;

const drawRow = () => ({
  id: "draw-1",
  prize: "playstation5-or-600",
  status: drawStatus,
  promo_start: "2026-09-26T00:00:00Z",
  promo_end: "2026-12-15T12:00:00Z",
  winner_user_id: drawStatus === "open" ? null : "user-1",
  runner_up_user_id: drawStatus === "open" ? null : "user-2",
  winner_email: drawStatus === "open" ? null : winnerEmailAddress,
  runner_up_email: drawStatus === "open" ? null : "runner@example.com",
  winner_entries: drawStatus === "open" ? null : 3,
  runner_up_entries: drawStatus === "open" ? null : 2,
  drawn_at: drawStatus === "open" ? null : "2026-12-15T12:05:00Z",
  response_deadline: drawStatus === "open" ? null : "2026-12-22T12:05:00Z",
  winner_email_id: null,
  winner_delivery_status: "not_sent",
  winner_delivery_checked_at: null,
  winner_delivery_detail: null,
  claimed_at: null,
  prize_choice: null,
  created_at: "2026-09-26T00:00:00Z",
});

function installFetch() {
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : null;

    // --- Mail provider ----------------------------------------------------
    if (url.startsWith("https://api.resend.com/emails") && method === "POST") {
      sendAttempts.push(body);
      if (body.to[0] === winnerEmailAddress && failSendToWinner) {
        return new Response("provider is down", { status: 503 });
      }
      // Only successful sends are recorded as sent.
      sentEmails.push(body);
      return new Response(JSON.stringify({ id: `sent_${sentEmails.length}` }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // --- RPC --------------------------------------------------------------
    const rpc = url.match(/\/rest\/v1\/rpc\/(\w+)$/);
    if (rpc) {
      switch (rpc[1]) {
        case "raffle_draw_winner":
          drawCallCount++;
          drawStatus = "drawn";
          return Response.json([
            {
              winner_user_id: "user-1",
              winner_email: winnerEmailAddress,
              winner_entries: 3,
              runner_up_user_id: "user-2",
              runner_up_email: "runner@example.com",
              runner_up_entries: 2,
            },
          ]);
        case "raffle_mark_email_sent":
          if (markSentFails) {
            return new Response(JSON.stringify({ message: "write failed" }), { status: 400 });
          }
          return Response.json([]);
        default:
          return Response.json([]);
      }
    }

    // --- Table reads ------------------------------------------------------
    if (url.includes("/rest/v1/raffle_draws")) {
      const wantsObject = Object.entries(init?.headers ?? {}).some(
        ([k, v]) => k.toLowerCase() === "accept" && v === "application/vnd.pgrst.object+json",
      );
      return Response.json(wantsObject ? drawRow() : [drawRow()]);
    }

    if (url.includes("/rest/v1/raffle_entries")) {
      return Response.json([
        { user_id: "user-1", username: "winner", entries: 3, review_entries: 1, referral_entries: 2, verified_referrals: 4 },
        { user_id: "user-2", username: "runner", entries: 2, review_entries: 0, referral_entries: 2, verified_referrals: 4 },
      ]);
    }

    throw new Error(`Unexpected fetch in test: ${method} ${url}`);
  };
}

before(() => installFetch());
after(() => {
  globalThis.fetch = realFetch;
});

beforeEach(() => {
  drawStatus = "open";
  winnerEmailAddress = "winner@example.com";
  failSendToWinner = false;
  markSentFails = false;
  sentEmails = [];
  sendAttempts = [];
  drawCallCount = 0;
});

test("a successful draw emails the winner and the owner", async () => {
  const result = await runDraw({ force: true });

  assert.equal(drawCallCount, 1);
  assert.equal(result.winner.userId, "user-1");
  assert.equal(result.winner.username, "winner", "the username comes from the pool snapshot");
  assert.equal(result.winner.entries, 3);
  assert.equal(result.runnerUp.userId, "user-2");

  assert.equal(result.winnerEmail.sent, true);
  assert.equal(result.ownerReport.delivered, true);

  const toWinner = sentEmails.find((m) => m.to[0] === "winner@example.com");
  const toOwner = sentEmails.find((m) => m.to[0] === "polar@example.com");
  assert.ok(toWinner, "the winner is emailed");
  assert.ok(toOwner, "the owner is emailed");
  assert.match(toWinner.subject, /You won/);
  assert.match(toOwner.html, /winner@example\.com/);
});

test("a winner email that fails still reaches the owner, loudly", async () => {
  // The draw is already committed by this point and cannot be re-run, so
  // swallowing this would lose the prize with nobody told.
  failSendToWinner = true;

  const result = await runDraw({ force: true });

  assert.equal(result.winnerEmail.sent, false, "the failure is reported");
  assert.match(result.winnerEmail.error, /could not be sent/i);
  assert.equal(result.ownerReport.delivered, true, "the owner is still emailed");

  const toOwner = sentEmails.find((m) => m.to[0] === "polar@example.com");
  assert.ok(toOwner, "the owner hears about it");
  assert.match(toOwner.html, /winner was NOT emailed/i);
  assert.match(toOwner.html, /"action":"resend"/, "and is told how to fix it");
});

test("a winner with no email address on file is reported, not skipped", async () => {
  winnerEmailAddress = "";
  const result = await runDraw({ force: true });

  assert.equal(result.winnerEmail.sent, false);
  assert.match(result.winnerEmail.error, /no email address/i);
  assert.equal(result.ownerReport.delivered, true, "the owner is told");
  assert.equal(
    sentEmails.filter((m) => m.to[0] === "polar@example.com").length,
    1,
    "and told exactly once",
  );
});

test("a recorded-id failure is not reported as a failure to send", async () => {
  // The mail really did go out. Losing the audit id is a lesser problem and
  // must not be dressed up as "the winner was not emailed".
  markSentFails = true;
  const result = await runDraw({ force: true });

  assert.equal(result.winnerEmail.sent, true);
  assert.match(result.winnerEmail.error, /could not be recorded/i);
  assert.ok(!/NOT emailed/.test(sentEmails.at(-1).html), "not escalated to a lost-prize alert");
});

test("the draw is refused before the published date", async () => {
  const prior = process.env.RAFFLE_DRAW_AT;
  process.env.RAFFLE_DRAW_AT = "2099-01-01T00:00:00.000Z";
  try {
    await assert.rejects(() => runDraw(), /has not opened yet/);
    assert.equal(drawCallCount, 0, "nothing was drawn");
  } finally {
    process.env.RAFFLE_DRAW_AT = prior;
  }
});

test("a raffle that has already been drawn cannot be drawn again", async () => {
  await runDraw({ force: true });
  assert.equal(drawCallCount, 1);

  await assert.rejects(() => runDraw({ force: true }), /already drawn/);
  assert.equal(drawCallCount, 1, "the draw ran exactly once");
});

test("a re-send recovers a draw whose winner email failed", async () => {
  // The real recovery path: the draw is locked, the first send failed, and the
  // owner re-sends to the address frozen at draw time.
  failSendToWinner = true;
  const drawn = await runDraw({ force: true });
  assert.equal(drawn.winnerEmail.sent, false);
  assert.equal(sentEmails.length, 1, "only the owner's report went out");

  failSendToWinner = false;
  sentEmails = [];

  const retry = await resendWinnerEmail("draw-1");
  assert.equal(retry.sent, true);
  assert.equal(retry.email, "winner@example.com", "the address frozen at draw time");
  assert.ok(retry.emailId, "a fresh provider id is recorded for the delivery check");
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].to[0], "winner@example.com");
  assert.match(sentEmails[0].subject, /You won/, "the winner, not the owner");
});

test("a re-send that fails again says so instead of pretending", async () => {
  failSendToWinner = true;
  await runDraw({ force: true });
  sentEmails = [];

  const retry = await resendWinnerEmail("draw-1");
  assert.equal(retry.sent, false);
  assert.match(retry.error, /could not be sent/i);
  assert.equal(sentEmails.length, 0);
});

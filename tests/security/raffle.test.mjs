/**
 * Raffle entry accounting + draw fairness.
 *
 * These run against a real Postgres (PGlite) with the 0098 migration applied,
 * because the things worth verifying here are the SQL semantics themselves:
 * the stacking arithmetic, the "fresh review" window, and above all that the
 * draw is actually weighted by entries rather than uniform.
 *
 * A raffle that quietly picks uniformly is a legal and reputational problem,
 * so the weighting is tested statistically over many draws.
 *
 * Isolation: every test draws from its own promo window, keyed by an "era".
 * Users are stamped 100 days apart per era and each draw's window only covers
 * its own era, so a test never sees another test's entrants. Without this the
 * draw tests silently pool everyone's entries and the weighted/uniform
 * distinction disappears.
 */

import { readFile } from "node:fs/promises";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";

let db;

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Era layout, in days before now:
//   data sits at ERA + 50 ; the window covers [ERA + 90, ERA + 10)
// so data for era 1 (150 days ago) sits outside era 0's window (10..90 days).
const eraBase = (era) => era * 100;
const dataAge = (era, extra = 0) => eraBase(era) + 50 + extra;
const windowAgeStart = (era) => eraBase(era) + 90;
const windowAgeEnd = (era) => eraBase(era) + 10;

before(async () => {
  db = new PGlite();

  // Stand-ins for the tables 0098 reads. The Supabase roles are created
  // because the migration's REVOKE statements name them.
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema if not exists auth;
    create table auth.users (
      id uuid primary key,
      email text,
      email_confirmed_at timestamptz
    );
    create table public.profiles (
      id uuid primary key,
      username text
    );
    create table public.platform_bans (
      user_id uuid primary key
    );
    create table public.app_reviews (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null unique,
      stars smallint not null,
      body text not null default '',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table public.referrals (
      id uuid primary key default gen_random_uuid(),
      referrer_id uuid not null,
      referred_user_id uuid not null,
      status text not null default 'pending',
      created_at timestamptz not null default now(),
      verified_at timestamptz
    );
  `);

  await db.exec(await readFile("supabase/migrations/0098_raffle.sql", "utf8"));
});

after(async () => {
  await db?.close();
});

async function seedUser(n, {
  era = 0,
  stars = null,
  reviewExtraDays = 0,
  referralCount = 0,
  referralStatus = "verified",
} = {}) {
  const id = uuid(n);
  await db.query(`insert into public.profiles (id, username) values ($1, $2)`, [id, `user${n}`]);
  await db.query(
    `insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`,
    [id, `user${n}@example.com`],
  );
  if (stars !== null) {
    const age = String(dataAge(era, reviewExtraDays));
    await db.query(
      `insert into public.app_reviews (user_id, stars, created_at, updated_at)
       values ($1, $2, now() - ($3 || ' days')::interval, now() - ($3 || ' days')::interval)`,
      [id, stars, age],
    );
  }
  for (let i = 0; i < referralCount; i++) {
    const friend = uuid(900000 + n * 100 + i);
    await db.query(
      `insert into public.referrals (referrer_id, referred_user_id, status, verified_at)
       values ($1, $2, $3, now() - ($4 || ' days')::interval)`,
      [id, friend, referralStatus, String(dataAge(era))],
    );
  }
  return id;
}

async function openDraw(era = 0) {
  const { rows } = await db.query(
    `insert into public.raffle_draws (promo_start, promo_end)
     values (now() - ($1 || ' days')::interval, now() - ($2 || ' days')::interval)
     returning id`,
    [String(windowAgeStart(era)), String(windowAgeEnd(era))],
  );
  return rows[0].id;
}

/** Entry counts for one account inside one era's window. */
async function countsFor(userId, era) {
  const { rows } = await db.query(
    `select * from public.raffle_entry_counts(
       now() - ($1 || ' days')::interval, now() - ($2 || ' days')::interval)
     where user_id = $3`,
    [String(windowAgeStart(era)), String(windowAgeEnd(era)), userId],
  );
  return rows;
}

test("a 5-star review earns exactly 1 entry", async () => {
  const id = await seedUser(1, { era: 0, stars: 5 });
  const rows = await countsFor(id, 0);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].entries, 1);
  assert.equal(rows[0].review_entries, 1);
  assert.equal(rows[0].referral_entries, 0);
});

test("a non-5-star review earns nothing", async () => {
  const id = await seedUser(2, { era: 1, stars: 4 });
  assert.equal((await countsFor(id, 1)).length, 0, "a 4-star review is not an entry");
});

test("referral entries stack: every 2 verified referrals = 1 entry, no cap", async () => {
  const id = await seedUser(3, { era: 2, referralCount: 10 });
  const rows = await countsFor(id, 2);
  assert.equal(rows[0].referral_entries, 5);
  assert.equal(rows[0].entries, 5, "10 verified referrals = 5 entries, uncapped");
});

test("an odd leftover referral does not earn a partial entry", async () => {
  const id = await seedUser(4, { era: 3, referralCount: 3 }); // floor(3/2) = 1
  assert.equal((await countsFor(id, 3))[0].entries, 1);
});

test("pending (unverified) referrals earn nothing", async () => {
  const id = await seedUser(5, { era: 4, referralCount: 4, referralStatus: "pending" });
  assert.equal((await countsFor(id, 4)).length, 0, "unverified referrals must not count");
});

test("review and referral entries stack together", async () => {
  const id = await seedUser(6, { era: 5, stars: 5, referralCount: 4 }); // 1 + 2 = 3
  const rows = await countsFor(id, 5);
  assert.equal(rows[0].review_entries, 1);
  assert.equal(rows[0].referral_entries, 2);
  assert.equal(rows[0].entries, 3, "both entry types count");
});

test("a review from before the promo window is not an entry", async () => {
  // Review stamped before the window opens.
  const id = await seedUser(7, { era: 6, stars: 5, reviewExtraDays: 60 });
  assert.equal((await countsFor(id, 6)).length, 0, "stale 5-star reviews must not count");
});

test("a review first written before the window but updated inside it counts", async () => {
  // The published rule is a *fresh* 5-star review in the promo window. An
  // account that had an old review and edits it to 5 stars during the promo is
  // performing a qualifying action, so it earns an entry.
  const id = await seedUser(8, { era: 7, stars: 5 });
  await db.query(
    `update public.app_reviews set created_at = now() - interval '900 days'
     where user_id = $1`,
    [id],
  );
  const rows = await countsFor(id, 7);
  assert.equal(rows.length, 1, "an old review bumped to 5 stars during the promo counts");
  assert.equal(rows[0].entries, 1);
});

test("banned accounts are excluded from the pool", async () => {
  const id = await seedUser(9, { era: 8, stars: 5 });
  await db.query(`insert into public.platform_bans (user_id) values ($1)`, [id]);
  assert.equal((await countsFor(id, 8)).length, 0, "banned users must not be eligible");
});

test("the draw snapshots the pool and picks a weighted winner", async () => {
  const heavy = await seedUser(20, { era: 10, referralCount: 20 }); // 10 entries
  const light = await seedUser(21, { era: 10, stars: 5 });          // 1 entry
  const drawId = await openDraw(10);

  const { rows } = await db.query(`select * from public.raffle_draw_winner($1)`, [drawId]);
  assert.equal(rows.length, 1);

  const pool = await db.query(`select * from public.raffle_entries where raffle_id = $1`, [drawId]);
  assert.equal(pool.rows.length, 2, "both entrants are snapshotted");
  assert.equal(pool.rows.find((r) => r.user_id === heavy).entries, 10);
  assert.equal(pool.rows.find((r) => r.user_id === light).entries, 1);

  const d = await db.query(`select * from public.raffle_draws where id = $1`, [drawId]);
  assert.equal(d.rows[0].status, "drawn");
  assert.ok([heavy, light].includes(d.rows[0].winner_user_id));
  assert.notEqual(d.rows[0].winner_user_id, d.rows[0].runner_up_user_id, "winner and runner-up are distinct");

  // 7-day response window, as published.
  const days = (new Date(d.rows[0].response_deadline) - new Date(d.rows[0].drawn_at)) / 86400000;
  assert.ok(Math.abs(days - 7) < 0.01, `response window should be 7 days, got ${days}`);

  // Email snapshotted from the account address at draw time.
  assert.match(d.rows[0].winner_email, /@example\.com$/);
});

test("the draw is WEIGHTED by entries, not uniform", async () => {
  // heavy: 30 entries, light: 1 entry, in an era containing nobody else.
  // A uniform draw would land near 50/50 and fail this; correct weighting puts
  // the heavy entrant at ~96.8%.
  const heavy = await seedUser(30, { era: 11, referralCount: 60 });
  await seedUser(31, { era: 11, stars: 5 });
  let heavyWins = 0;
  const trials = 300;

  for (let i = 0; i < trials; i++) {
    const drawId = await openDraw(11);
    const { rows } = await db.query(`select * from public.raffle_draw_winner($1)`, [drawId]);
    if (rows[0].winner_user_id === heavy) heavyWins++;
  }

  const rate = heavyWins / trials;
  assert.ok(rate > 0.9, `heavy entrant should win ~97% of draws, got ${(rate * 100).toFixed(1)}%`);
  assert.ok(rate < 1.0, "the light entrant must still be able to win");
});

test("every entrant can win: 20 entrants with 1 entry each", async () => {
  // Guards against an off-by-one in the cumulative walk that would starve the
  // last row in the pool (or bias toward whichever sorts first).
  const era = 12;
  const ids = [];
  for (let i = 0; i < 20; i++) {
    ids.push(await seedUser(300 + i, { era, stars: 5 }));
  }
  const seen = new Set();
  for (let i = 0; i < 120; i++) {
    const drawId = await openDraw(era);
    const { rows } = await db.query(`select * from public.raffle_draw_winner($1)`, [drawId]);
    seen.add(rows[0].winner_user_id);
  }
  assert.equal(seen.size, 20, `all 20 entrants should be able to win; saw ${seen.size}`);
  for (const id of ids) assert.ok(seen.has(id), "each entrant must be reachable");
});

test("the runner-up is never the winner, even with only two entrants", async () => {
  // The narrow case that a naive "pick a second ticket" implementation gets
  // wrong: with a small pool both tickets can land in the same entrant's range.
  const era = 22;
  const a = await seedUser(400, { era, referralCount: 6 }); // 3 entries
  const b = await seedUser(401, { era, referralCount: 2 }); // 1 entry
  for (let i = 0; i < 200; i++) {
    const drawId = await openDraw(era);
    const { rows } = await db.query(`select * from public.raffle_draw_winner($1)`, [drawId]);
    assert.notEqual(
      rows[0].winner_user_id,
      rows[0].runner_up_user_id,
      "winner and runner-up must be different people",
    );
    assert.ok([a, b].includes(rows[0].runner_up_user_id), "runner-up comes from the pool");
  }
});

test("a sole entrant wins with no runner-up, and expiry has no fallback", async () => {
  const era = 23;
  const only = await seedUser(410, { era, stars: 5 });
  const drawId = await openDraw(era);
  const { rows } = await db.query(`select * from public.raffle_draw_winner($1)`, [drawId]);
  assert.equal(rows[0].winner_user_id, only);
  assert.equal(rows[0].runner_up_user_id, null, "no second person exists to hold in reserve");

  // After the window closes, an unclaimed sole-entrant draw expires cleanly
  // rather than promoting the winner to themselves.
  await db.query(
    `update public.raffle_draws set response_deadline = now() - interval '1 second' where id = $1`,
    [drawId],
  );
  const r = await db.query(`select * from public.raffle_promote_runner_up($1)`, [drawId]);
  assert.equal(r.rows[0].promoted, false);

  const d = await db.query(`select * from public.raffle_draws where id = $1`, [drawId]);
  assert.equal(d.rows[0].status, "expired");
  assert.equal(d.rows[0].winner_user_id, only, "the entrant is left in place, not re-drawn");
});

test("a draw cannot be run twice", async () => {
  await seedUser(40, { era: 13, stars: 5 });
  const drawId = await openDraw(13);
  await db.query(`select * from public.raffle_draw_winner($1)`, [drawId]);
  await assert.rejects(
    () => db.query(`select * from public.raffle_draw_winner($1)`, [drawId]),
    /not open/,
    "re-drawing an already-drawn raffle must be refused",
  );
});

test("a draw with no eligible entries is refused", async () => {
  const drawId = await openDraw(14); // era 14 has no users at all
  await assert.rejects(
    () => db.query(`select * from public.raffle_draw_winner($1)`, [drawId]),
    /no eligible entries/,
  );
});

test("delivery status is recorded and terminal states are sticky", async () => {
  await seedUser(50, { era: 15, stars: 5 });
  const drawId = await openDraw(15);
  await db.query(`select * from public.raffle_draw_winner($1)`, [drawId]);

  await db.query(`select public.raffle_mark_email_sent($1, 'email_abc')`, [drawId]);
  let d = await db.query(`select * from public.raffle_draws where id = $1`, [drawId]);
  assert.equal(d.rows[0].winner_delivery_status, "accepted");
  assert.equal(d.rows[0].winner_email_id, "email_abc");

  await db.query(`select public.raffle_record_delivery($1, 'delivered', 'inbox')`, [drawId]);
  d = await db.query(`select * from public.raffle_draws where id = $1`, [drawId]);
  assert.equal(d.rows[0].winner_delivery_status, "delivered");

  // A late in-flight event must not undo a delivered/bounced outcome.
  await db.query(`select public.raffle_record_delivery($1, 'bounced', 'mailbox full')`, [drawId]);
  await db.query(`select public.raffle_record_delivery($1, 'accepted')`, [drawId]);
  d = await db.query(`select * from public.raffle_draws where id = $1`, [drawId]);
  assert.equal(d.rows[0].winner_delivery_status, "delivered", "delivered is terminal");
});

test("a bounce sticks when a later event is less severe", async () => {
  await seedUser(51, { era: 16, stars: 5 });
  const drawId = await openDraw(16);
  await db.query(`select * from public.raffle_draw_winner($1)`, [drawId]);
  await db.query(`select public.raffle_record_delivery($1, 'bounced', 'no such mailbox')`, [drawId]);
  await db.query(`select public.raffle_record_delivery($1, 'accepted')`, [drawId]);
  const d = await db.query(`select * from public.raffle_draws where id = $1`, [drawId]);
  assert.equal(d.rows[0].winner_delivery_status, "bounced", "a bounce is terminal");
});

test("an unsupported delivery status is rejected", async () => {
  await seedUser(52, { era: 17, stars: 5 });
  const drawId = await openDraw(17);
  await db.query(`select * from public.raffle_draw_winner($1)`, [drawId]);
  await assert.rejects(
    () => db.query(`select public.raffle_record_delivery($1, 'exploded')`, [drawId]),
    /unsupported delivery status/,
  );
});

test("a claim is recorded, and only console/gift_card are valid", async () => {
  await seedUser(60, { era: 18, stars: 5 });
  const drawId = await openDraw(18);
  await db.query(`select * from public.raffle_draw_winner($1)`, [drawId]);

  await db.query(`select public.raffle_claim($1, 'console')`, [drawId]);
  let d = await db.query(`select * from public.raffle_draws where id = $1`, [drawId]);
  assert.equal(d.rows[0].status, "claimed");
  assert.equal(d.rows[0].prize_choice, "console");
  assert.ok(d.rows[0].claimed_at);

  const draw2 = await openDraw(18);
  await db.query(`select * from public.raffle_draw_winner($1)`, [draw2]);
  await assert.rejects(
    () => db.query(`select public.raffle_claim($1, 'gold_bars')`, [draw2]),
    /console or gift_card/,
  );
});

test("a claim after the deadline is refused", async () => {
  await seedUser(61, { era: 19, stars: 5 });
  const drawId = await openDraw(19);
  await db.query(`select * from public.raffle_draw_winner($1)`, [drawId]);
  await db.query(
    `update public.raffle_draws set response_deadline = now() - interval '1 second' where id = $1`,
    [drawId],
  );
  await assert.rejects(
    () => db.query(`select public.raffle_claim($1, 'console')`, [drawId]),
    /not claimable/,
    "the 7-day window must actually be enforced",
  );
});

test("the runner-up is promoted only after the 7-day window closes", async () => {
  const winner = await seedUser(70, { era: 20, stars: 5, referralCount: 4 });
  const runner = await seedUser(71, { era: 20, referralCount: 4 });
  const drawId = await openDraw(20);
  await db.query(`select * from public.raffle_draw_winner($1)`, [drawId]);
  await db.query(
    `update public.raffle_draws
     set winner_user_id = $2, runner_up_user_id = $3,
         winner_email = 'winner@example.com', runner_up_email = 'runner@example.com'
     where id = $1`,
    [drawId, winner, runner],
  );

  let r = await db.query(`select * from public.raffle_promote_runner_up($1)`, [drawId]);
  assert.equal(r.rows[0].promoted, false, "must not promote before the deadline");

  await db.query(
    `update public.raffle_draws set response_deadline = now() - interval '1 second' where id = $1`,
    [drawId],
  );
  r = await db.query(`select * from public.raffle_promote_runner_up($1)`, [drawId]);
  assert.equal(r.rows[0].promoted, true, "runner-up is promoted after the deadline");
  assert.equal(r.rows[0].promoted_user_id, runner);

  const d = await db.query(`select * from public.raffle_draws where id = $1`, [drawId]);
  assert.equal(d.rows[0].winner_user_id, runner, "runner-up becomes the winner");
  assert.equal(d.rows[0].winner_email, "runner@example.com");
  assert.equal(d.rows[0].status, "expired", "the missed draw is marked expired");
  assert.equal(d.rows[0].winner_delivery_status, "not_sent", "promotion resets delivery so the new winner gets contacted");
  assert.equal(d.rows[0].runner_up_user_id, null);
});

test("promotion is idempotent and will not promote a claimed draw", async () => {
  const winner = await seedUser(80, { era: 21, stars: 5 });
  const runner = await seedUser(81, { era: 21, referralCount: 2 });
  const drawId = await openDraw(21);
  await db.query(`select * from public.raffle_draw_winner($1)`, [drawId]);
  await db.query(
    `update public.raffle_draws
     set winner_user_id = $2, runner_up_user_id = $3, response_deadline = now() - interval '1 day'
     where id = $1`,
    [drawId, winner, runner],
  );

  const first = await db.query(`select * from public.raffle_promote_runner_up($1)`, [drawId]);
  assert.equal(first.rows[0].promoted, true);
  const second = await db.query(`select * from public.raffle_promote_runner_up($1)`, [drawId]);
  assert.equal(second.rows[0].promoted, false, "promotion must be safe to call repeatedly");

  const draw2 = await openDraw(21);
  await db.query(`select * from public.raffle_draw_winner($1)`, [draw2]);
  await db.query(`select public.raffle_claim($1, 'gift_card')`, [draw2]);
  await db.query(
    `update public.raffle_draws set response_deadline = now() - interval '30 days' where id = $1`,
    [draw2],
  );
  const r = await db.query(`select * from public.raffle_promote_runner_up($1)`, [draw2]);
  assert.equal(r.rows[0].promoted, false, "a claimed draw must not be promoted");
});

test("the entry pool is not readable or writable by clients", async () => {
  // No anon/authenticated policies exist, so RLS denies by default. Verify the
  // tables have RLS on and that no permissive policy is defined for clients.
  for (const table of ["raffle_draws", "raffle_entries"]) {
    const r = await db.query(`select relrowsecurity as rls from pg_class where relname = $1`, [table]);
    assert.equal(r.rows[0].rls, true, `${table} must have RLS enabled`);

    const pol = await db.query(
      `select count(*)::int as n from pg_policies where tablename = $1 and schemaname = 'public'`,
      [table],
    );
    assert.equal(pol.rows[0].n, 0, `${table} must expose no client policies`);
  }
});

test("client roles hold no privileges on the raffle tables", async () => {
  // Defence in depth: even if a policy were ever added by mistake, the grants
  // themselves must not hand the pool to anon/authenticated.
  for (const table of ["raffle_draws", "raffle_entries"]) {
    for (const role of ["anon", "authenticated"]) {
      const r = await db.query(
        `select has_table_privilege($1, $2, 'select') as can_select,
                has_table_privilege($1, $2, 'insert') as can_insert,
                has_table_privilege($1, $2, 'update') as can_update`,
        [role, `public.${table}`],
      );
      assert.equal(r.rows[0].can_select, false, `${role} must not select ${table}`);
      assert.equal(r.rows[0].can_insert, false, `${role} must not insert ${table}`);
      assert.equal(r.rows[0].can_update, false, `${role} must not update ${table}`);
    }
  }
});

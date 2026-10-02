/**
 * @everyone cap removal (migration 0115).
 *
 * 0092 capped @everyone at 2 per 10 minutes per author — written back when the
 * fanout regex was still broken and the token pinged nobody. It is gone: the
 * per-minute (10) and per-hour (50) ping budgets and the 10-mentions-per-
 * message cap still bind everyone. This binds enforce_mention_rate (from
 * 0115) to fixture tables and proves both halves: repeated @everyone goes
 * through, and the general limits still fire.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const ALICE = '00000000-0000-4000-8000-0000000000a1';
const BOB = '00000000-0000-4000-8000-0000000000b2';

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create table public.messages(
      id uuid primary key default gen_random_uuid(),
      author_id uuid not null,
      content text not null default '',
      mentions uuid[] not null default '{}',
      created_at timestamptz not null default now());
    create table public.dm_messages(
      id uuid primary key default gen_random_uuid(),
      author_id uuid not null,
      content text not null default '',
      mentions uuid[] not null default '{}',
      created_at timestamptz not null default now());
    create table public.group_messages(
      id uuid primary key default gen_random_uuid(),
      author_id uuid not null,
      content text not null default '',
      mentions uuid[] not null default '{}',
      created_at timestamptz not null default now());`);
  await db.exec(await readFile('supabase/migrations/0115_drop_everyone_cap.sql', 'utf8'));
  return db;
}

const send = (db, content, mentions = '{}') =>
  db.query(`insert into public.messages (author_id, content, mentions) values ($1, $2, $3)`, [
    ALICE, content, mentions,
  ]);

test('@everyone has no dedicated cap any more', async () => {
  const db = await fixture();
  try {
    // 0092 raised on the third one inside 10 minutes; five must now pass.
    for (let i = 0; i < 5; i++) {
      await send(db, `@everyone announcement ${i}`);
    }
    const { rows } = await db.query(`select count(*)::int as n from public.messages`);
    assert.equal(rows[0].n, 5);

    // DM and group tables use the same function, so they are uncapped too.
    await db.query(
      `insert into public.dm_messages (author_id, content) values ($1, '@everyone hi'), ($1, '@everyone yo')`,
      [ALICE],
    );
    await db.query(
      `insert into public.group_messages (author_id, content) values ($1, '@everyone hey')`,
      [ALICE],
    );

    // The rule itself is gone from the live body, not just outvoted.
    const { rows: fns } = await db.query(
      `select pg_get_functiondef(oid) as def from pg_proc where proname = 'enforce_mention_rate'`,
    );
    assert.equal(fns.length, 1);
    assert.doesNotMatch(fns[0].def, /10 minutes/, 'no @everyone window left');
    assert.doesNotMatch(fns[0].def, /rate limited/, 'no @everyone error left');
    assert.match(fns[0].def, /interval ''1 minute''/, 'per-minute ping budget kept');
    assert.match(fns[0].def, /interval ''1 hour''/, 'per-hour ping budget kept');
  } finally {
    await db.close();
  }
});

test('the general ping limits still bind', async () => {
  const db = await fixture();
  try {
    // 11th ping inside a minute is refused (@everyone included in the count).
    for (let i = 0; i < 10; i++) await send(db, `@everyone spam ${i}`);
    await assert.rejects(
      () => send(db, '@everyone one too many'),
      /pinging people too quickly/,
      'per-minute budget still enforced',
    );

    // Mentions of real users count too: >10 in one message is refused.
    const tooMany = Array.from({ length: 11 }, (_, i) =>
      `00000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`);
    await assert.rejects(
      () => send(db, 'hi all', tooMany),
      /Too many mentions/,
      '10-mention cap kept',
    );

    // Plain messages never touch the limiter.
    for (let i = 0; i < 30; i++) await send(db, `just chatting ${i}`);
    const { rows } = await db.query(
      `select count(*)::int as n from public.messages where content not like '%@everyone%'`);
    assert.equal(rows[0].n, 30);
    assert.ok(ALICE && BOB);
  } finally {
    await db.close();
  }
});

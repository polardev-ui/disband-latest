/**
 * Migration 0244: Bruce.
 *
 *   - his status counts the spaces that have added him, live;
 *   - public install codes are only shown while the invite is still open;
 *   - coins never go below zero, and ticket numbers count up per space.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const BRUCE = '30000000-0000-4000-8000-0000000000b5';
const OTHER = '30000000-0000-4000-8000-0000000000c1';
const BOT = '20000000-0000-4000-8000-000000000001';
const S1 = '10000000-0000-4000-8000-000000000001';
const S2 = '10000000-0000-4000-8000-000000000002';

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema cron; create schema net; create schema vault;
    create table auth.users (id uuid primary key, email text);
    create table cron.job (jobid int, jobname text);
    create function cron.schedule(a text, b text, c text) returns int language sql as $$ select 1 $$;
    create function cron.unschedule(a int) returns boolean language sql as $$ select true $$;
    create table vault.decrypted_secrets (name text, decrypted_secret text);
    create table public.calls (url text);
    create function net.http_post(url text, headers jsonb, body jsonb) returns bigint language sql as $$ insert into public.calls values (url) returning 1::bigint $$;
    create table public.profiles (id uuid primary key, username text, status text, status_note text, status_expires_at timestamptz);
    create table public.servers (id uuid primary key, name text);
    create table public.channels (id uuid primary key, server_id uuid);
    create table public.server_roles (id uuid primary key, server_id uuid);
    create table public.bots (id uuid primary key, user_id uuid, owner_id uuid, revoked_at timestamptz, created_at timestamptz default now());
    create table public.bot_grants (bot_id uuid, server_id uuid, scopes text[]);
    create table public.bot_invites (id uuid primary key default gen_random_uuid(), bot_id uuid, code text, status text);
    create table public.bot_events (id bigint generated always as identity, bot_id uuid, type text, payload jsonb default '{}');
  `);
  await db.query(`insert into auth.users values ($1, 'bruce@disband.dev'), ($2, 'x@y.z')`, [BRUCE, OTHER]);
  await db.query(`insert into public.profiles (id, username) values ($1, 'bruce'), ($2, 'other')`, [BRUCE, OTHER]);
  await db.query(`insert into public.servers values ($1, 'One'), ($2, 'Two')`, [S1, S2]);
  await db.query(`insert into public.bots (id, user_id, owner_id) values ($1, $2, $2)`, [BOT, BRUCE]);
  await db.exec(await readFile('supabase/migrations/0244_bruce.sql', 'utf8'));
  return db;
}

const note = async (db) => (await db.query(`select status, status_note from public.profiles where id = $1`, [BRUCE])).rows[0];

test('his status counts the spaces that added him, live', async () => {
  const db = await fixture();
  try {
    assert.deepEqual(await note(db), { status: 'online', status_note: 'Currently protecting: 0 servers!' });
    await db.query(`insert into public.bot_grants values ($1, $2, '{}')`, [BOT, S1]);
    assert.equal((await note(db)).status_note, 'Currently protecting: 1 server!');
    await db.query(`insert into public.bot_grants values ($1, $2, '{}')`, [BOT, S2]);
    assert.equal((await note(db)).status_note, 'Currently protecting: 2 servers!');
    await db.query(`delete from public.bot_grants where server_id = $1`, [S1]);
    assert.equal((await note(db)).status_note, 'Currently protecting: 1 server!');
  } finally {
    await db.close();
  }
});

test('events for Bruce wake him; others do not', async () => {
  const db = await fixture();
  try {
    await db.exec(`insert into vault.decrypted_secrets values ('raffle_url', 'https://x.test/api/cron/raffle'), ('raffle_cron_key', 'k')`);
    await db.query(`insert into public.bot_events (bot_id, type) values ($1, 'messageCreate')`, [BOT]);
    await db.query(`insert into public.bot_events (bot_id, type) values ('20000000-0000-4000-8000-000000000099', 'messageCreate')`);
    const { rows } = await db.query(`select url from public.calls`);
    assert.deepEqual(rows.map((r) => r.url), ['https://x.test/api/bruce/run']);
  } finally {
    await db.close();
  }
});

test('install codes show only while the invite is open', async () => {
  const db = await fixture();
  try {
    await db.query(`insert into public.bot_invites (bot_id, code, status) values ($1, 'abc', 'pending')`, [BOT]);
    await db.query(`update public.bots set public_install_code = 'abc'`);
    assert.equal((await db.query(`select public.public_bot_install_code($1) c`, [BRUCE])).rows[0].c, 'abc');
    await db.query(`update public.bot_invites set status = 'expired'`);
    assert.equal((await db.query(`select public.public_bot_install_code($1) c`, [BRUCE])).rows[0].c, null);
  } finally {
    await db.close();
  }
});

test('coins never go negative; ticket numbers count up', async () => {
  const db = await fixture();
  try {
    await db.query(`select public.bruce_add_coins($1, $2, 100)`, [S1, OTHER]);
    await assert.rejects(db.query(`select public.bruce_add_coins($1, $2, -150)`, [S1, OTHER]), /Not enough/);
    const r = (await db.query(`select * from public.bruce_add_coins($1, $2, -40, 40)`, [S1, OTHER])).rows[0];
    assert.equal(Number(r.coins), 60);
    assert.equal(Number(r.bank), 40);
    const a = (await db.query(`select public.bruce_next_ticket_number($1) n`, [S1])).rows[0].n;
    const b = (await db.query(`select public.bruce_next_ticket_number($1) n`, [S1])).rows[0].n;
    const c = (await db.query(`select public.bruce_next_ticket_number($1) n`, [S2])).rows[0].n;
    assert.deepEqual([a, b, c], [1, 2, 1]);
  } finally {
    await db.close();
  }
});

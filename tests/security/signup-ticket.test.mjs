/**
 * Migration 0258: every new account needs a sign-up ticket.
 *
 *   - without a ticket the insert into auth.users fails;
 *   - a ticket (stored lowercase) lets one account through and is used up;
 *   - expired tickets don't count;
 *   - server-made accounts (bots, webhooks) need none;
 *   - the auth hook only checks, so it can't use the ticket up first.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_app_meta_data jsonb default '{}');
    create table public.signup_tickets (email text primary key, expires_at timestamptz not null, created_at timestamptz default now());
    create table public.blocked_email_domains (domain text primary key, reason text, added_at timestamptz default now());
  `);
  await db.exec(await readFile('supabase/migrations/0258_signup_ticket_enforcement.sql', 'utf8'));
  return db;
}

const signUp = (db, email, meta = {}) =>
  db.query(`insert into auth.users (email, raw_app_meta_data) values ($1, $2)`, [email, JSON.stringify(meta)]);
const ticket = (db, email, minutes = 15) =>
  db.query(`insert into public.signup_tickets (email, expires_at) values ($1, now() + make_interval(mins => $2))`, [email, minutes]);

test('no ticket, no account; a ticket lets exactly one through', async () => {
  const db = await fixture();
  try {
    await assert.rejects(signUp(db, 'kai@example.com'), /signup_ticket_required/);
    await ticket(db, 'kai@example.com');
    await signUp(db, 'Kai@Example.com ');
    const left = await db.query(`select count(*)::int n from public.signup_tickets`);
    assert.equal(left.rows[0].n, 0, 'the ticket is used up');
    await assert.rejects(signUp(db, 'kai2@example.com'), /signup_ticket_required/);
  } finally {
    await db.close();
  }
});

test('expired tickets do not count', async () => {
  const db = await fixture();
  try {
    await ticket(db, 'late@example.com', -1);
    await assert.rejects(signUp(db, 'late@example.com'), /signup_ticket_required/);
  } finally {
    await db.close();
  }
});

test('server-made accounts need no ticket', async () => {
  const db = await fixture();
  try {
    await signUp(db, 'bot-1@bots.disband.dev', { created_by: 'server', provider: 'email' });
    const { rows } = await db.query(`select count(*)::int n from auth.users`);
    assert.equal(rows[0].n, 1);
  } finally {
    await db.close();
  }
});

test('the auth hook checks without using the ticket up', async () => {
  const db = await fixture();
  try {
    const hook = async (email) => (await db.query(`select public.hook_before_user_created($1::jsonb) r`, [JSON.stringify({ user: { email, app_metadata: {} } })])).rows[0].r;
    assert.ok((await hook('new@example.com')).error, 'refused without a ticket');
    await ticket(db, 'new@example.com');
    assert.deepEqual(await hook('new@example.com'), {});
    // Still there for the trigger, which uses it.
    await signUp(db, 'new@example.com');
  } finally {
    await db.close();
  }
});

test('throwaway mail servers and domains are seeded', async () => {
  const db = await fixture();
  try {
    const s = await db.query(`select count(*)::int n from public.blocked_mail_servers where ip = '159.195.145.63'`);
    assert.equal(s.rows[0].n, 1);
    const d = await db.query(`select count(*)::int n from public.blocked_email_domains where domain in ('smaau.com','lugiz.com','mailum.com')`);
    assert.equal(d.rows[0].n, 3);
  } finally {
    await db.close();
  }
});

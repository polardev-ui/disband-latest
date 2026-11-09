/**
 * Migration 0243: Tether welcomes new members.
 *
 *   - placeholders fill in ($user pings, $membercount counts the new member);
 *   - the picked channel wins, else a text channel named "welcome";
 *   - off by default, bots are not greeted, and a failed post never blocks a join;
 *   - only Manage Space can change the settings.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const OWNER = '30000000-0000-4000-8000-000000000001';
const JOINER = '30000000-0000-4000-8000-000000000002';
const BOT = '30000000-0000-4000-8000-000000000003';
const TETHER = '30000000-0000-4000-8000-0000000000ee';
const SERVER = '10000000-0000-4000-8000-000000000001';
const GENERAL = '40000000-0000-4000-8000-000000000001';
const WELCOME = '40000000-0000-4000-8000-000000000002';

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create table public.test_auth (uid uuid);
    insert into public.test_auth values (null);
    create function auth.uid() returns uuid language sql as $$ select uid from public.test_auth $$;
    create table public.profiles (id uuid primary key, username text, display_name text, is_bot boolean default false);
    create table public.servers (id uuid primary key, name text, owner_id uuid);
    create table public.channels (id uuid primary key, server_id uuid, name text, type text default 'text', position int default 0, created_at timestamptz default now());
    create table public.server_members (server_id uuid, user_id uuid, role text default 'member', primary key (server_id, user_id));
    create table public.messages (id uuid primary key default gen_random_uuid(), channel_id uuid, author_id uuid, content text, created_at timestamptz default now());
    create table public.test_perm (allowed boolean);
    insert into public.test_perm values (false);
    create function public.user_has_server_permission(s uuid, u uuid, p text) returns boolean language sql as $$
      select (select allowed from public.test_perm) or exists (select 1 from public.servers where id = s and owner_id = u) $$;
  `);
  await db.query(`insert into auth.users values ($1, 'tether@disband.dev')`, [TETHER]);
  await db.query(`insert into public.profiles (id, username, display_name, is_bot) values
    ($1, 'polar', 'Polar', false), ($2, 'kai', 'Kai', false), ($3, 'helper', null, true), ($4, 'tether', 'Tether', true)`,
    [OWNER, JOINER, BOT, TETHER]);
  await db.query(`insert into public.servers values ($1, 'Paladin Haven', $2)`, [SERVER, OWNER]);
  await db.query(`insert into public.channels (id, server_id, name) values ($1, $3, 'general'), ($2, $3, 'welcome')`, [GENERAL, WELCOME, SERVER]);
  await db.query(`insert into public.server_members (server_id, user_id, role) values ($1, $2, 'owner')`, [SERVER, OWNER]);
  await db.exec(await readFile('supabase/migrations/0243_welcome_messages.sql', 'utf8'));
  // A per-author limit like 0022's, so system posts are seen to pass it.
  await db.exec(`create trigger rate before insert on public.messages for each row execute function public.enforce_channel_message_rate();`);
  return db;
}

const as = (db, uid) => db.query(`update public.test_auth set uid = $1`, [uid]);
const posts = async (db) => (await db.query(`select channel_id, author_id, content from public.messages order by created_at`)).rows;

test('greets with placeholders filled in, in #welcome by default', async () => {
  const db = await fixture();
  try {
    await db.query(`insert into public.server_members (server_id, user_id) values ($1, $2)`, [SERVER, JOINER]);
    assert.equal((await posts(db)).length, 0, 'off until turned on');
    await db.query(`delete from public.server_members where user_id = $1`, [JOINER]);

    await as(db, OWNER);
    await db.query(`select public.set_welcome_settings($1, true, null, $2)`,
      [SERVER, '**Welcome in, $user to $server!** We are $membercount strong, you are our $ordinal. Hi $displayname ($username).']);
    await db.query(`insert into public.server_members (server_id, user_id) values ($1, $2)`, [SERVER, JOINER]);
    const [post] = await posts(db);
    assert.equal(post.channel_id, WELCOME);
    assert.equal(post.author_id, TETHER);
    assert.equal(post.content, '**Welcome in, @kai to Paladin Haven!** We are 2 strong, you are our 2nd. Hi Kai (kai).');

    await db.query(`insert into public.server_members (server_id, user_id) values ($1, $2)`, [SERVER, BOT]);
    assert.equal((await posts(db)).length, 1, 'bots are not greeted');
  } finally {
    await db.close();
  }
});

test('the picked channel wins, and a failed post never blocks the join', async () => {
  const db = await fixture();
  try {
    await as(db, OWNER);
    await db.query(`select public.set_welcome_settings($1, true, $2, null)`, [SERVER, GENERAL]);
    await db.exec(`create function public.boom() returns trigger language plpgsql as $$ begin raise exception 'nope'; end $$;
      create trigger boom before insert on public.messages for each row execute function public.boom();`);
    await db.query(`insert into public.server_members (server_id, user_id) values ($1, $2)`, [SERVER, JOINER]);
    const joined = await db.query(`select 1 from public.server_members where user_id = $1`, [JOINER]);
    assert.equal(joined.rows.length, 1, 'joined anyway');
    await db.exec(`drop trigger boom on public.messages`);

    await db.query(`delete from public.server_members where user_id = $1`, [JOINER]);
    await db.query(`insert into public.server_members (server_id, user_id) values ($1, $2)`, [SERVER, JOINER]);
    const [post] = await posts(db);
    assert.equal(post.channel_id, GENERAL);
    assert.match(post.content, /Welcome to Paladin Haven, @kai!/);
  } finally {
    await db.close();
  }
});

test('Tether is not held back by the per-author limit', async () => {
  const db = await fixture();
  try {
    await as(db, OWNER);
    await db.query(`select public.set_welcome_settings($1, true, null, 'hi $user')`, [SERVER]);
    for (let i = 0; i < 10; i++) {
      const id = `30000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`;
      await db.query(`insert into public.profiles (id, username) values ($1, $2)`, [id, `u${i}`]);
      await db.query(`insert into public.server_members (server_id, user_id) values ($1, $2)`, [SERVER, id]);
    }
    assert.equal((await posts(db)).length, 10);
  } finally {
    await db.close();
  }
});

test('only Manage Space can change the settings', async () => {
  const db = await fixture();
  try {
    await as(db, JOINER);
    await assert.rejects(db.query(`select public.set_welcome_settings($1, true, null, 'x')`, [SERVER]), /Manage Space/);
    await as(db, OWNER);
    await assert.rejects(db.query(`select public.set_welcome_settings($1, true, $2, 'x')`, [SERVER, '40000000-0000-4000-8000-000000000099']), /text channel/);
  } finally {
    await db.close();
  }
});

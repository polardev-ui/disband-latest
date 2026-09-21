import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { botBucketKey } from '../../src/lib/bot-gateway-guard.ts';
import { rateLimit } from '../../src/lib/rate-limit.ts';

const owner = '11111111-1111-4111-8111-111111111111';
const bot = '22222222-2222-4222-8222-222222222222';
const botuser = '33333333-3333-4333-8333-333333333333';
const server = '44444444-4444-4444-8444-444444444444';
const outsiderServer = '66666666-6666-4666-8666-666666666666';

async function setup() {
  const db = new PGlite();
  await db.exec("create schema auth");
  await db.exec("create function auth.uid() returns uuid language sql as 'select null::uuid'");
  for (const stmt of [
    "create table public.profiles(id uuid primary key)",
    "create table public.servers(id uuid primary key, owner_id uuid)",
    "create table public.server_members(server_id uuid, user_id uuid, role text default 'member', role_id uuid)",
    "create table public.channels(id uuid primary key default '00000000-0000-0000-0000-000000000000', server_id uuid, category_id uuid, name text, type text, position int, read_only boolean default false)",
    "create table public.bots(id uuid primary key, owner_id uuid, user_id uuid, name text, scopes text[], token_hash text, token_prefix text, revoked_at timestamptz)",
    "create table public.bot_grants(bot_id uuid, server_id uuid, scopes text[])",
    "create table public.bot_invites(id uuid primary key default '00000000-0000-0000-0000-000000000000', bot_id uuid, server_id uuid, code text unique, scopes text[], status text default 'pending', created_by uuid, created_at timestamptz default now(), expires_at timestamptz default now() + interval '7 days')",
    "create table public.platform_bans(user_id uuid primary key)",
    "create function public.is_valid_bot_scopes(p_scopes text[]) returns boolean language plpgsql immutable as $$ begin return true; end; $$",
    "create function public.is_bot_platform_banned(p_bot_id uuid) returns boolean language sql stable as $$ select exists (select 1 from public.platform_bans b join public.bots x on x.id = p_bot_id where b.user_id in (x.user_id, x.owner_id)) $$",
    "create function public.bot_has_server_permission(p_server_id uuid, p_user_id uuid, p_permission text) returns boolean language sql stable as $$ select true $$",
    "create role service_role",
  ]) await db.exec(stmt);
  let sql = await readFile('supabase/migrations/0094_bot_gateway_hardening.sql', 'utf8');
  sql = sql.replaceAll('gen_random_bytes(16)', `decode('${randomBytes(16).toString('hex')}','hex')`);
  await db.exec(sql);
  await db.exec(`insert into public.profiles(id) values ('${owner}'),('${botuser}')`);
  await db.exec(`insert into public.servers(id, owner_id) values ('${server}','${owner}'),('${outsiderServer}','${botuser}')`);
  await db.exec(`insert into public.server_members(server_id, user_id, role) values ('${server}','${botuser}','member'),('${server}','${owner}','owner')`);
  await db.exec(`insert into public.bots(id, owner_id, user_id, name, scopes, token_hash, token_prefix) values ('${bot}','${owner}','${botuser}','b',array['messages.read','messages.write','channels.manage'],'h','p')`);
  await db.exec(`insert into public.bot_grants(bot_id, server_id, scopes) values ('${bot}','${server}',array['messages.read','messages.write','channels.manage'])`);
  return db;
}

test('banned bots cannot manage channels', async () => {
  const db = await setup();
  try {
    await db.exec(`insert into public.platform_bans(user_id) values ('${owner}')`);
    await assert.rejects(db.query(`select public.bot_create_channel('${bot}','${server}','x')`), /restricted/);
    await assert.rejects(db.query(`select public.bot_rename_channel('${bot}','${server}','x')`), /restricted|not found/i);
    await assert.rejects(
      db.query(`select public.bot_delete_channel('${bot}','${server}')`),
      /restricted|not found/i,
    );
  } finally { await db.close(); }
});

test('invites require target-server membership; names capped at 100', async () => {
  const db = await setup();
  try {
    await assert.rejects(
      db.query(`select public.bot_create_invite('${bot}','${owner}','${outsiderServer}',array['messages.read'])`),
      /must be a member/,
    );
    const code = await db.query(`select public.bot_create_invite('${bot}','${owner}','${server}',array['messages.read']) result`);
    assert.equal(String(code.rows[0].result).length, 32);
    await assert.rejects(
      db.query(`select public.bot_create_channel('${bot}','${server}','${'x'.repeat(101)}')`),
      /too long/,
    );
    const ch = await db.query(`select public.bot_create_channel('${bot}','${server}','fine') result`);
    assert.ok(ch.rows[0].result);
  } finally { await db.close(); }
});

test('bot gateway guard keys are namespaced per bucket', async () => {
  assert.equal(botBucketKey('gateway', 'b1'), 'bot:gateway:b1');
  assert.notEqual(botBucketKey('read', 'b1'), botBucketKey('write', 'b1'));
  assert.equal(rateLimit('bot-test-burst', 1, 60000).allowed, true);
  assert.equal(rateLimit('bot-test-burst', 1, 60000).allowed, false);
});

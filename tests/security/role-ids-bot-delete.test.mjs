/**
 * Migration 0242: numeric role ids, and bot_delete_message.
 *
 *   - existing roles get a unique display_id; new roles get one by default;
 *   - bot_role_to_json reports it as a string;
 *   - a bot deletes its own messages, and others' only with Manage Messages;
 *   - the message must be in the channel named, and the bot must see it.
 *
 * bot_actor, channel_permission_for and bot_has_server_permission are reduced
 * to table lookups here; their own rules are covered where they are defined.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const SERVER = '10000000-0000-4000-8000-000000000001';
const BOT = '20000000-0000-4000-8000-000000000001';
const BOT_USER = '30000000-0000-4000-8000-0000000000b0';
const MEMBER = '30000000-0000-4000-8000-0000000000a1';
const CHANNEL = '40000000-0000-4000-8000-000000000001';
const OTHER_CHANNEL = '40000000-0000-4000-8000-000000000002';

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create sequence public.snowflake_seq;
    create function public.generate_snowflake() returns bigint language plpgsql as $$
      begin return (((extract(epoch from clock_timestamp()) * 1000)::bigint - 1420070400000) << 10) | (nextval('public.snowflake_seq') % 1024); end $$;
    create table public.server_roles (
      id uuid primary key default gen_random_uuid(), server_id uuid not null, name text not null,
      color text not null default '#99aab5', position int not null default 0, permissions jsonb not null default '{}',
      is_default boolean not null default false, self_assignable boolean not null default false);
    create table public.channels (id uuid primary key, server_id uuid not null);
    create table public.messages (id uuid primary key default gen_random_uuid(), channel_id uuid not null, author_id uuid not null, content text);
    create table public.test_bot (granted boolean, manage_messages boolean, can_view boolean);
    insert into public.test_bot values (true, false, true);
    create function public.bot_actor(p_bot_id uuid, p_server_id uuid, p_scopes text[], p_permission text default null)
      returns uuid language plpgsql as $$
      begin
        if not (select granted from public.test_bot) then raise exception 'This bot does not have messages.delete in that server'; end if;
        return '${BOT_USER}'::uuid;
      end $$;
    create function public.channel_permission_for(p_actor uuid, p_channel_id uuid, p_permission text)
      returns boolean language sql as $$ select can_view from public.test_bot $$;
    create function public.bot_has_server_permission(p_server_id uuid, p_user uuid, p_perm text)
      returns boolean language sql as $$ select p_perm = 'manage_messages' and manage_messages from public.test_bot $$;
  `);
  await db.query(`insert into public.server_roles (server_id, name) values ($1, 'a'), ($1, 'b'), ($1, 'c')`, [SERVER]);
  await db.query(`insert into public.channels values ($1, $3), ($2, $3)`, [CHANNEL, OTHER_CHANNEL, SERVER]);
  await db.exec(await readFile('supabase/migrations/0242_role_ids_and_bot_message_delete.sql', 'utf8'));
  return db;
}

async function attempt(db, sql, params) {
  try {
    await db.query(sql, params);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: String(error.message ?? error) };
  }
}

test('roles get unique numeric ids, reported to bots as strings', async () => {
  const db = await fixture();
  try {
    await db.query(`insert into public.server_roles (server_id, name) values ($1, 'new')`, [SERVER]);
    const { rows } = await db.query(`select display_id::text as d from public.server_roles`);
    assert.equal(rows.length, 4);
    assert.ok(rows.every((r) => /^\d{10,19}$/.test(r.d)), 'every role has a number');
    assert.equal(new Set(rows.map((r) => r.d)).size, 4, 'and they are unique');
    assert.ok(rows.every((r) => BigInt(r.d) <= 9_007_199_254_740_991n), 'safe for JavaScript');
    const dup = await attempt(db, `update public.server_roles set display_id = (select min(display_id) from public.server_roles)`);
    assert.equal(dup.ok, false, 'the unique index holds');
    const json = await db.query(`select public.bot_role_to_json(r, 99) as j from public.server_roles r limit 1`);
    assert.equal(typeof json.rows[0].j.display_id, 'string');
  } finally {
    await db.close();
  }
});

test('bots delete their own messages, and others’ only with Manage Messages', async () => {
  const db = await fixture();
  try {
    const add = async (author, channel = CHANNEL) =>
      (await db.query(`insert into public.messages (channel_id, author_id, content) values ($1, $2, 'x') returning id`, [channel, author])).rows[0].id;
    const del = (channel, id) => attempt(db, `select public.bot_delete_message($1, $2, $3)`, [BOT, channel, id]);
    const exists = async (id) => (await db.query(`select 1 from public.messages where id = $1`, [id])).rows.length === 1;

    const own = await add(BOT_USER);
    assert.equal((await del(CHANNEL, own)).ok, true);
    assert.equal(await exists(own), false, 'own message deleted without Manage Messages');

    const theirs = await add(MEMBER);
    const denied = await del(CHANNEL, theirs);
    assert.equal(denied.ok, false);
    assert.match(denied.message, /manage_messages/);
    assert.equal(await exists(theirs), true);

    await db.exec(`update public.test_bot set manage_messages = true`);
    assert.equal((await del(CHANNEL, theirs)).ok, true);
    assert.equal(await exists(theirs), false, 'anyone’s message with Manage Messages');

    const elsewhere = await add(MEMBER, OTHER_CHANNEL);
    const wrong = await del(CHANNEL, elsewhere);
    assert.equal(wrong.ok, false, 'the message must be in the channel named');
    assert.match(wrong.message, /Message not found/);

    await db.exec(`update public.test_bot set can_view = false`);
    const hidden = await add(MEMBER);
    assert.equal((await del(CHANNEL, hidden)).ok, false, 'not in channels the bot cannot see');

    await db.exec(`update public.test_bot set can_view = true, granted = false`);
    assert.equal((await del(CHANNEL, hidden)).ok, false, 'needs the messages.delete scope');
    assert.equal(await exists(hidden), true);
  } finally {
    await db.close();
  }
});

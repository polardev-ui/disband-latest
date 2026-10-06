/**
 * Voice-call trust root: the signal sender gates (1:1, group, voice
 * channel) admit only verified participants, and for voice channels that
 * proof IS presence — so presence itself must be membership-gated.
 *
 * Applies the voice_presence SELECT/INSERT policies (0004_rls_invites_roles,
 * 0023_security_hardening) against minimal tables. is_server_member is a
 * faithful reimplementation (membership row exists); the real function
 * additionally respects bans/restrictions, which only narrows access.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';

const MEMBER = '11111111-1111-1111-1111-111111111111';
const OUTSIDER = '33333333-3333-3333-3333-333333333333';
const SERVER = 'a0000000-0000-0000-0000-000000000001';
const CHANNEL = 'b0000000-0000-0000-0000-000000000001';

async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    create table public.servers(id uuid primary key);
    create table public.channels(id uuid primary key, server_id uuid);
    create table public.server_members(server_id uuid, user_id uuid, role text);
    create table public.voice_presence(channel_id uuid, user_id uuid, joined_at timestamptz default now());
    alter table public.voice_presence enable row level security;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    create function public.is_server_member(p_server uuid) returns boolean language sql as $$
      select exists (select 1 from public.server_members where server_id = p_server and user_id = auth.uid()) $$;`);
  await db.exec(`create policy "voice_select" on public.voice_presence for select to authenticated
    using (
      exists (
        select 1 from public.channels c
        where c.id = voice_presence.channel_id and public.is_server_member(c.server_id)
      )
    );`);
  await db.exec(`create policy "voice_insert_own" on public.voice_presence for insert to authenticated
    with check (
      auth.uid() = user_id
      and exists (
        select 1 from public.channels c
        where c.id = voice_presence.channel_id
          and public.is_server_member(c.server_id)
      )
    );`);
  await db.exec(`insert into public.servers values ('${SERVER}');
    insert into public.channels values ('${CHANNEL}', '${SERVER}');
    insert into public.server_members values ('${SERVER}', '${MEMBER}', 'member');`);
  return db;
}

async function asUser(db, uid, sql, params = []) {
  await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub = '${uid}';`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec(`RESET ROLE; RESET request.jwt.claim.sub;`);
  }
}

test('only server members can join voice presence', async () => {
  const db = await setup();
  try {
    await asUser(db, MEMBER, `insert into public.voice_presence(channel_id, user_id) values ('${CHANNEL}', '${MEMBER}')`);
    let err = null;
    try {
      await asUser(db, OUTSIDER, `insert into public.voice_presence(channel_id, user_id) values ('${CHANNEL}', '${OUTSIDER}')`);
    } catch (e) {
      err = e;
    }
    assert.ok(err, 'outsider presence insert must be refused');

    // And the impersonation variant: member inserting AS someone else.
    let err2 = null;
    try {
      await asUser(db, MEMBER, `insert into public.voice_presence(channel_id, user_id) values ('${CHANNEL}', '${OUTSIDER}')`);
    } catch (e) {
      err2 = e;
    }
    assert.ok(err2, 'presence insert for another user must be refused');
  } finally { await db.close(); }
});

test('outsiders cannot read voice presence rows', async () => {
  const db = await setup();
  try {
    await asUser(db, MEMBER, `insert into public.voice_presence(channel_id, user_id) values ('${CHANNEL}', '${MEMBER}')`);
    const rows = await asUser(db, OUTSIDER, 'select * from public.voice_presence');
    assert.equal(rows.rows.length, 0);
    const memberRows = await asUser(db, MEMBER, 'select * from public.voice_presence');
    assert.equal(memberRows.rows.length, 1);
  } finally { await db.close(); }
});

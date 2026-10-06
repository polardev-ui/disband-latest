/**
 * Adversarial RLS: message and DM authorization boundaries.
 *
 * Builds minimal tables and applies the CREATE POLICY statements VERBATIM
 * from supabase/migrations/0002_full_app.sql (messages_select/insert,
 * update_own/delete_own, dm_threads_select/insert, dm_messages_select/
 * insert/delete_own), then attacks as three users:
 *
 *   alice — server member, DM participant with bob
 *   bob   — server member, DM participant with alice
 *   mallory — total outsider (no memberships, no threads)
 *
 * If the policies drift in the migration, update the copies here too —
 * the source line numbers are noted on each block.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';

const ALICE = '11111111-1111-1111-1111-111111111111';
const BOB = '22222222-2222-2222-2222-222222222222';
const MALLORY = '33333333-3333-3333-3333-333333333333';
const SERVER = 'a0000000-0000-0000-0000-000000000001';
const CHANNEL = 'b0000000-0000-0000-0000-000000000001';
const THREAD = 'c0000000-0000-0000-0000-000000000001';
const ALICE_MSG = 'd0000000-0000-0000-0000-000000000001';

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
    create table public.messages(id uuid primary key, channel_id uuid, author_id uuid, content text);
    create table public.dm_threads(id uuid primary key, user_a uuid, user_b uuid);
    create table public.dm_messages(id uuid primary key, thread_id uuid, author_id uuid, content text);
    alter table public.servers enable row level security;
    alter table public.channels enable row level security;
    alter table public.server_members enable row level security;
    alter table public.messages enable row level security;
    alter table public.dm_threads enable row level security;
    alter table public.dm_messages enable row level security;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    -- membership rows readable so the EXISTS() subqueries can run
    create policy "open_members" on public.server_members for select to authenticated using (true);
    create policy "open_servers" on public.servers for select to authenticated using (true);`);

  // --- verbatim from 0002_full_app.sql (channels/messages/DM blocks) ---
  await db.exec(`create policy "channels_select" on public.channels for select to authenticated
    using (exists (
      select 1 from public.server_members sm
      where sm.server_id = channels.server_id and sm.user_id = auth.uid()
    ));`);
  await db.exec(`create policy "messages_select" on public.messages for select to authenticated
    using (exists (
      select 1 from public.channels c
      join public.server_members sm on sm.server_id = c.server_id
      where c.id = messages.channel_id and sm.user_id = auth.uid()
    ));`);
  await db.exec(`create policy "messages_insert" on public.messages for insert to authenticated
    with check (
      auth.uid() = author_id
      and exists (
        select 1 from public.channels c
        join public.server_members sm on sm.server_id = c.server_id
        where c.id = messages.channel_id and sm.user_id = auth.uid()
      )
    );`);
  await db.exec(`create policy "messages_update_own" on public.messages for update to authenticated
    using (auth.uid() = author_id) with check (auth.uid() = author_id);`);
  await db.exec(`create policy "messages_delete_own" on public.messages for delete to authenticated
    using (auth.uid() = author_id);`);
  await db.exec(`create policy "dm_threads_select" on public.dm_threads for select to authenticated
    using (auth.uid() in (user_a, user_b));`);
  await db.exec(`create policy "dm_threads_insert" on public.dm_threads for insert to authenticated
    with check (auth.uid() in (user_a, user_b));`);
  await db.exec(`create policy "dm_messages_select" on public.dm_messages for select to authenticated
    using (exists (
      select 1 from public.dm_threads t
      where t.id = dm_messages.thread_id and auth.uid() in (t.user_a, t.user_b)
    ));`);
  await db.exec(`create policy "dm_messages_insert" on public.dm_messages for insert to authenticated
    with check (
      auth.uid() = author_id
      and exists (
        select 1 from public.dm_threads t
        where t.id = dm_messages.thread_id and auth.uid() in (t.user_a, t.user_b)
      )
    );`);
  await db.exec(`create policy "dm_messages_delete_own" on public.dm_messages for delete to authenticated
    using (auth.uid() = author_id);`);

  // Seed as ownerless superuser (PGlite default bypasses RLS for the owner).
  await db.exec(`insert into public.servers values ('${SERVER}');
    insert into public.channels values ('${CHANNEL}', '${SERVER}');
    insert into public.server_members values ('${SERVER}', '${ALICE}', 'member'), ('${SERVER}', '${BOB}', 'member');
    insert into public.messages values ('${ALICE_MSG}', '${CHANNEL}', '${ALICE}', 'hello');
    insert into public.dm_threads values ('${THREAD}', '${ALICE}', '${BOB}');
    insert into public.dm_messages values ('d0000000-0000-0000-0000-000000000002', '${THREAD}', '${ALICE}', 'hi bob');`);
  return db;
}

async function asUser(db, uid, sql, params = []) {
  // Bare SET (session scope on this connection), not set_config(..., true):
  // the latter is transaction-local and evaporates before the query runs.
  await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub = '${uid}';`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec(`RESET ROLE; RESET request.jwt.claim.sub;`);
  }
}

async function rejects(db, uid, sql, params = []) {
  let err = null;
  try {
    await asUser(db, uid, sql, params);
  } catch (e) {
    err = e;
  }
  assert.ok(err, `expected RLS refusal for ${uid}: ${sql}`);
}

test('channel messages: members read/write own, outsiders get nothing', async () => {
  const db = await setup();
  try {
    const aliceRows = await asUser(db, ALICE, 'select id from public.messages');
    assert.equal(aliceRows.rows.length, 1);
    const malloryRows = await asUser(db, MALLORY, 'select id from public.messages');
    assert.equal(malloryRows.rows.length, 0);

    await rejects(db, MALLORY, `insert into public.messages values ('d0000000-0000-0000-0000-000000000099', '${CHANNEL}', '${MALLORY}', 'x')`);
    // Forged authorship: mallory is not even a member, but also author must be self.
    await rejects(db, BOB, `insert into public.messages values ('d0000000-0000-0000-0000-000000000098', '${CHANNEL}', '${ALICE}', 'forged')`);
    // Member writing as self works.
    await asUser(db, BOB, `insert into public.messages values ('d0000000-0000-0000-0000-000000000097', '${CHANNEL}', '${BOB}', 'hey')`);
  } finally { await db.close(); }
});

test('channel messages: only the author edits or deletes', async () => {
  const db = await setup();
  try {
    // RLS-filtered UPDATE/DELETE affects zero rows rather than raising —
    // assert the no-op, not an exception.
    const upd = await asUser(db, BOB, `update public.messages set content = 'pwned' where id = '${ALICE_MSG}' returning id`);
    assert.equal(upd.rows.length, 0);
    const del1 = await asUser(db, MALLORY, `delete from public.messages where id = '${ALICE_MSG}' returning id`);
    assert.equal(del1.rows.length, 0);
    const del2 = await asUser(db, BOB, `delete from public.messages where id = '${ALICE_MSG}' returning id`);
    assert.equal(del2.rows.length, 0);
    await asUser(db, ALICE, `update public.messages set content = 'edited' where id = '${ALICE_MSG}' returning id`);
    const check = await asUser(db, ALICE, `select content from public.messages where id = '${ALICE_MSG}'`);
    assert.equal(check.rows[0].content, 'edited');
  } finally { await db.close(); }
});

test('DMs: strangers see and write nothing', async () => {
  const db = await setup();
  try {
    const bobThreads = await asUser(db, BOB, 'select id from public.dm_threads');
    assert.equal(bobThreads.rows.length, 1);
    assert.equal((await asUser(db, MALLORY, 'select id from public.dm_threads')).rows.length, 0);
    assert.equal((await asUser(db, MALLORY, 'select id from public.dm_messages')).rows.length, 0);

    // Mallory opens a thread "with" alice that excludes himself.
    await rejects(db, MALLORY, `insert into public.dm_threads values ('c0000000-0000-0000-0000-000000000099', '${ALICE}', '${BOB}')`);
    // Mallory writes into alice/bob's thread, even forging alice's authorship.
    await rejects(db, MALLORY, `insert into public.dm_messages values ('d0000000-0000-0000-0000-000000000099', '${THREAD}', '${ALICE}', 'forged')`);

    // Participant writes as self.
    await asUser(db, BOB, `insert into public.dm_messages values ('d0000000-0000-0000-0000-000000000096', '${THREAD}', '${BOB}', 'hi alice')`);
    // Participant cannot forge the other side.
    await rejects(db, BOB, `insert into public.dm_messages values ('d0000000-0000-0000-0000-000000000095', '${THREAD}', '${ALICE}', 'forged')`);
  } finally { await db.close(); }
});

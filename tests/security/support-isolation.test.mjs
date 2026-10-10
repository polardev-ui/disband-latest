/**
 * Support ticket isolation + Tether targeting lockdown.
 *
 * 1. RLS: verbatim policies from 0121_support_tickets.sql. Alice's tickets
 *    and messages are invisible and untouchable to Bob, and vice versa.
 * 2. Tool shape: every support tool takes NO parameters, so there is no
 *    field a prompt-injection or crafted request could use to aim Tether
 *    at another account. The user id travels server-side only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import {
  SUPPORT_TOOLS,
  executeSupportTool,
} from '../../src/lib/tether-support.ts';

const ALICE = '11111111-1111-1111-1111-111111111111';
const BOB = '22222222-2222-2222-2222-222222222222';
const ALICE_TICKET = 'aaaaaaaa-0000-4000-8000-000000000001';

async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    create table public.support_tickets(id uuid primary key, user_id uuid, email text, subject text, status text, created_at timestamptz default now(), updated_at timestamptz default now());
    create table public.support_messages(id uuid primary key default gen_random_uuid(), ticket_id uuid, role text, content text, created_at timestamptz default now());
    alter table public.support_tickets enable row level security;
    alter table public.support_messages enable row level security;
    grant select, insert, update, delete on all tables in schema public to authenticated;`);
  await db.exec(`create policy support_tickets_own on public.support_tickets
    for all to authenticated
    using (auth.uid() = user_id) with check (auth.uid() = user_id);`);
  await db.exec(`create policy support_messages_own_ticket on public.support_messages
    for all to authenticated
    using (exists (select 1 from public.support_tickets t where t.id = support_messages.ticket_id and t.user_id = auth.uid()))
    with check (exists (select 1 from public.support_tickets t where t.id = support_messages.ticket_id and t.user_id = auth.uid()));`);
  await db.exec(`insert into public.support_tickets(id, user_id, email, subject, status)
    values ('${ALICE_TICKET}', '${ALICE}', 'alice@example.com', 'locked out', 'open');
    insert into public.support_messages(ticket_id, role, content)
    values ('${ALICE_TICKET}', 'user', 'help');`);
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

test("bob sees none of alice's tickets or messages", async () => {
  const db = await setup();
  try {
    assert.equal((await asUser(db, BOB, 'select id from public.support_tickets')).rows.length, 0);
    assert.equal((await asUser(db, BOB, 'select id from public.support_messages')).rows.length, 0);
    assert.equal((await asUser(db, ALICE, 'select id from public.support_tickets')).rows.length, 1);
  } finally { await db.close(); }
});

test("bob cannot write into alice's ticket", async () => {
  const db = await setup();
  try {
    let err = null;
    try {
      await asUser(db, BOB, `insert into public.support_messages(ticket_id, role, content) values ('${ALICE_TICKET}', 'user', 'hi im bob')`);
    } catch (e) { err = e; }
    assert.ok(err, 'cross-ticket insert must be refused');
    let err2 = null;
    try {
      await asUser(db, BOB, `insert into public.support_tickets(user_id, email, subject, status) values ('${ALICE}', 'bob@evil.com', 'x', 'open')`);
    } catch (e) { err2 = e; }
    assert.ok(err2, 'forged user_id insert must be refused');
  } finally { await db.close(); }
});

test('support tools take no target parameters', () => {
  for (const tool of SUPPORT_TOOLS) {
    const props = tool.function.parameters?.properties ?? {};
    // Empty parameter objects: there is no field a prompt-injection or
    // crafted request could use to aim a tool at another account. The user
    // id travels server-side only.
    assert.deepEqual(Object.keys(props), [], `${tool.function.name} must not accept parameters`);
  }
  assert.ok(SUPPORT_TOOLS.length >= 4, 'expected the four account tools');
});

test('hallucinated main-tether tools are refused, never executed', async () => {
  const fakeService = {};
  for (const name of ['update_my_profile', 'create_server', 'list_my_notes', 'delete_account', 'read_other_user']) {
    const res = await executeSupportTool(fakeService, name, ALICE);
    assert.equal(res.ok, false);
  }
});

/**
 * Abuse holes closed by migration 0112 (all proven live before patching):
 *
 *  1. server_catalysts accepted client INSERTs gated only on self-
 *     attribution: one account minted 398 catalysts in 7 minutes against 8
 *     lifetime Stripe purchases.
 *  2. server_members accepted client INSERTs for self (join any server, no
 *     invite) and for anyone by owners/admins (force-add), with no client
 *     on any platform ever inserting directly — every join flows through
 *     the definer RPCs.
 *  3. profiles_update_own had no column restriction and the badge guard did
 *     not cover is_bot / bot_dm_enabled, so anyone could self-declare as a
 *     bot (one live rogue), dodging official notices, friend/block rules,
 *     and impersonating system accounts.
 *
 * The fixture recreates the vulnerable policies, proves each hole open,
 * applies 0112, and proves each hole closed — plus that the attack rows are
 * cleaned and legitimate state survives. Roles/claims follow the
 * broadcast.test.mjs pattern (SET ROLE to a non-superuser, because running
 * as the table owner would bypass RLS and prove nothing).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const ATTACKER = 'a3eceed8-6d40-4e90-abcf-3307871a31e4';
const ROGUE = '2ecd96b4-39e9-4b59-affb-fa7dc493306b';
const VICTIM = '00000000-0000-4000-8000-0000000000c3';
const SERVER = '00000000-0000-4000-8000-00000000d400';

async function asRole(db, role, sub, fn) {
  await db.exec(`set role ${role}`);
  await db.exec(`set request.jwt.claim.role = '${role}'`);
  if (sub) await db.exec(`set request.jwt.claim.sub = '${sub}'`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role`);
    await db.exec(`reset request.jwt.claim.sub`);
    await db.exec(`reset request.jwt.claim.role`);
  }
}

async function tryAsRole(db, role, sub, fn) {
  try {
    await asRole(db, role, sub, fn);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: String(error.message ?? error) };
  }
}

test('0112 closes catalyst counterfeit, member force-add, and bot-flag self-grant', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table public.profiles(
        id uuid primary key, username text, is_bot boolean not null default false,
        bot_dm_enabled boolean not null default false,
        show_owner_badge boolean not null default false,
        show_staff_badge boolean not null default false);
      create table public.bots(id uuid primary key, user_id uuid);
      create table public.servers(id uuid primary key);
      create table public.server_members(server_id uuid, user_id uuid, role text not null default 'member');
      create table public.server_catalysts(
        id uuid primary key default gen_random_uuid(), server_id uuid, user_id uuid,
        source text not null default 'grant',
        stripe_session_id text, apple_transaction_id text);
      alter table public.profiles enable row level security;
      alter table public.server_members enable row level security;
      alter table public.server_catalysts enable row level security;
      -- The vulnerable pre-0112 shape, mirroring production.
      create policy profiles_update_own on public.profiles for update to authenticated
        using (auth.uid() = id) with check (auth.uid() = id);
      -- UPDATE/DELETE as a role needs SELECT visibility too (no select
      -- policy means the scan finds zero rows and the write silently lands
      -- nowhere). Production has broad select policies on all three tables;
      -- mirroring that here so the tests exercise the write path, not an
      -- empty scan.
      create policy profiles_read on public.profiles
        for select to authenticated using (true);
      create policy members_read on public.server_members
        for select to authenticated using (true);
      create policy server_catalysts_insert_own on public.server_catalysts
        for insert to authenticated with check (user_id = auth.uid());
      create policy server_catalysts_read on public.server_catalysts
        for select to authenticated using (true);
      create policy server_members_insert on public.server_members
        for insert to authenticated with check (
          auth.uid() = user_id
          or exists (select 1 from public.server_members sm
            where sm.server_id = server_members.server_id
              and sm.user_id = auth.uid() and sm.role in ('owner','admin')));
      grant usage on schema public to authenticated, service_role;
      grant usage on schema auth to anon, authenticated, service_role;
      grant execute on function auth.uid() to anon, authenticated, service_role;
      grant select, insert, update, delete on all tables in schema public to authenticated;
      grant select, insert, update, delete on all tables in schema public to service_role;`);

    await db.query(
      `insert into public.profiles (id, username, is_bot) values
        ($1, 'informant', false), ($2, 'disbandcia', true), ($3, 'victim', false)`,
      [ATTACKER, ROGUE, VICTIM],
    );
    await db.query(`insert into public.servers (id) values ($1)`, [SERVER]);
    await db.query(
      `insert into public.server_catalysts (server_id, user_id, source)
       select $1, $2, 'grant' from generate_series(1, 5)`,
      [SERVER, ATTACKER],
    );
    await db.query(
      `insert into public.server_catalysts (server_id, user_id, source, stripe_session_id)
       values ($1, $2, 'purchase', 'cs_test_paid')`,
      [SERVER, VICTIM],
    );

    // The holes, demonstrated open before the patch.
    const counterfeit = await tryAsRole(db, 'authenticated', ATTACKER, () =>
      db.query(`insert into public.server_catalysts (server_id, user_id) values ($1, $2)`, [SERVER, ATTACKER]));
    assert.equal(counterfeit.ok, true, 'pre-patch: counterfeit catalyst lands');
    const forceJoin = await tryAsRole(db, 'authenticated', VICTIM, () =>
      db.query(`insert into public.server_members (server_id, user_id) values ($1, $2)`, [SERVER, VICTIM]));
    assert.equal(forceJoin.ok, true, 'pre-patch: self-join to any server lands');

    await db.exec(await readFile('supabase/migrations/0112_abuse_holes_catalysts_members_botflags.sql', 'utf8'));

    // Bind the badge-guard trigger the way 0023 does in production (the
    // function is what 0112 replaces; the binding predates it).
    await db.exec(`drop trigger if exists profiles_protect_platform_badges on public.profiles;
      create trigger profiles_protect_platform_badges
      before insert or update on public.profiles
      for each row execute function public.protect_platform_badges();`);

    // 1. Counterfeit closed — including for the author of the burst.
    const blocked = await tryAsRole(db, 'authenticated', ATTACKER, () =>
      db.query(`insert into public.server_catalysts (server_id, user_id) values ($1, $2)`, [SERVER, ATTACKER]));
    assert.equal(blocked.ok, false, 'post-patch: counterfeit catalyst is refused');
    // The webhook/Apple paths write through PostgREST as service_role, which
    // bypasses RLS at the PostgREST layer (not something PGlite reproduces),
    // so what this migration must guarantee is narrower: authenticated lost
    // INSERT while SELECT/DELETE are untouched.
    const privs = await db.query(
      `select has_table_privilege('authenticated', 'public.server_catalysts', 'INSERT') as ins,
              has_table_privilege('authenticated', 'public.server_catalysts', 'SELECT') as sel,
              has_table_privilege('authenticated', 'public.server_members', 'INSERT') as minsert,
              has_table_privilege('authenticated', 'public.server_members', 'SELECT') as msel`);
    assert.equal(privs.rows[0].ins, false, 'insert revoked on catalysts');
    assert.equal(privs.rows[0].sel, true, 'select intact on catalysts');
    assert.equal(privs.rows[0].minsert, false, 'insert revoked on members');
    assert.equal(privs.rows[0].msel, true, 'select intact on members');

    // 2. Force-add closed — self-join and owner-add alike.
    const selfJoin = await tryAsRole(db, 'authenticated', VICTIM, () =>
      db.query(`insert into public.server_members (server_id, user_id) values ($1, $2)`, [SERVER, VICTIM]));
    assert.equal(selfJoin.ok, false, 'post-patch: invite-less self-join is refused');

    // 3. Bot flags frozen for end-user sessions, service provisioning intact.
    await tryAsRole(db, 'authenticated', VICTIM, () =>
      db.query(`update public.profiles set is_bot = true, bot_dm_enabled = true where id = $1`, [VICTIM]));
    const victimFlags = await db.query(`select is_bot, bot_dm_enabled from public.profiles where id = $1`, [VICTIM]);
    assert.equal(victimFlags.rows[0].is_bot, false, 'self-granted is_bot is reverted');
    assert.equal(victimFlags.rows[0].bot_dm_enabled, false, 'self-granted bot_dm_enabled is reverted');
    await tryAsRole(db, 'authenticated', VICTIM, () =>
      db.query(`update public.profiles set username = 'victim2' where id = $1`, [VICTIM]));
    const renamed = await db.query(`select username from public.profiles where id = $1`, [VICTIM]);
    assert.equal(renamed.rows[0].username, 'victim2', 'ordinary profile edits still work');
    // Service-side provisioning (bot register route, Tether sync) writes
    // through PostgREST as service_role, which bypasses RLS at the PostgREST
    // layer; the owner session is the equivalent here.
    await db.query(`update public.profiles set is_bot = true where id = $1`, [VICTIM]);
    const provisioned = await db.query(`select is_bot from public.profiles where id = $1`, [VICTIM]);
    assert.equal(provisioned.rows[0].is_bot, true, 'service-side bot provisioning still works');

    // 4. Cleanup: burst rows gone, paid rows kept, rogue flag reset.
    // (Reset victim first so the survivor assertions read cleanly.)
    await db.query(`update public.profiles set is_bot = false, username = 'victim' where id = $1`, [VICTIM]);
    const grants = await db.query(`select count(*) as n from public.server_catalysts where source = 'grant' and stripe_session_id is null`);
    assert.equal(Number(grants.rows[0].n), 0, 'unpaid grant rows are gone');
    const purchases = await db.query(`select count(*) as n from public.server_catalysts where stripe_session_id is not null`);
    assert.equal(Number(purchases.rows[0].n), 1, 'the paid seed row survives');
    const rogue = await db.query(`select is_bot, bot_dm_enabled from public.profiles where id = $1`, [ROGUE]);
    assert.equal(rogue.rows[0].is_bot, false, 'rogue bot flag reset');
    assert.equal(rogue.rows[0].bot_dm_enabled, false, 'rogue dm flag reset');
  } finally {
    await db.close();
  }
});

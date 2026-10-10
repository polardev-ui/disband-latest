/**
 * Recruiter badge counts referral-code signups, not just server invites.
 *
 * Regression: @violet earned 25 verified referrals and got nothing, because
 * refresh_user_badges counted only server_members.invited_by joins AND
 * nothing refreshed the referrer when a referral verified. Uses the verbatim
 * recruit_count body plus the real on_referral_verified wiring (with a
 * stubbed refresh_user_badges that logs calls instead of running the full
 * 90-line evaluator).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';

const VIOLET = '11111111-1111-1111-1111-111111111111';
const FRIEND = '22222222-2222-2222-2222-222222222222';

async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table auth.users(id uuid primary key, email_confirmed_at timestamptz);
    create table public.server_members(server_id uuid, user_id uuid, invited_by uuid);
    create table public.referrals(referrer_id uuid, referred_user_id uuid, status text, verified_at timestamptz);
    create table public.refresh_calls(user_id uuid, at timestamptz default now());`);
  // Verbatim recruit_count from 0122 (table names it touches exist above).
  await db.exec(`create or replace function public.recruit_count(p_user uuid)
    returns bigint language sql stable as $$
      select count(*) from (
        select user_id from public.server_members where invited_by = p_user
        union
        select referred_user_id as user_id from public.referrals
        where referrer_id = p_user and status = 'verified'
      ) x;
    $$;`);
  // Stand-in for the real evaluator: records that it ran, for whom.
  await db.exec(`create or replace function public.refresh_user_badges(p_user uuid)
    returns void language sql as $$ insert into public.refresh_calls(user_id) values (p_user); $$;`);
  // Verbatim trigger body from 0122.
  await db.exec(`create or replace function public.on_referral_verified() returns trigger
    language plpgsql as $$
    declare v_referrer uuid;
    begin
      update public.referrals set status = 'verified', verified_at = now()
      where referred_user_id = new.id and status = 'pending';
      for v_referrer in
        select distinct referrer_id from public.referrals
        where referred_user_id = new.id and status = 'verified'
      loop
        perform public.refresh_user_badges(v_referrer);
      end loop;
      return new;
    end;
    $$;
    drop trigger if exists on_auth_email_verified on auth.users;
    create trigger on_auth_email_verified
      after update of email_confirmed_at on auth.users
      for each row
      when (new.email_confirmed_at is not null and old.email_confirmed_at is null)
      execute function public.on_referral_verified();`);
  return db;
}

test('25 verified referrals count, and dedupe shared users', async () => {
  const db = await setup();
  try {
    for (let i = 0; i < 25; i++) {
      await db.exec(`insert into public.referrals values ('${VIOLET}', '00000000-0000-0000-0000-${String(i).padStart(12, '0')}', 'verified', now())`);
    }
    // FRIEND was both referred AND joined a server on violet's invite: one person, one count.
    await db.exec(`insert into public.referrals values ('${VIOLET}', '${FRIEND}', 'verified', now())`);
    await db.exec(`insert into public.server_members values ('aaaaaaaa-0000-4000-8000-000000000001', '${FRIEND}', '${VIOLET}')`);
    const { rows } = await db.query(`select public.recruit_count('${VIOLET}') as n`);
    assert.equal(Number(rows[0].n), 26);
  } finally { await db.close(); }
});

test('email verification refreshes the referrer', async () => {
  const db = await setup();
  try {
    await db.exec(`insert into auth.users values ('${FRIEND}', null)`);
    await db.exec(`insert into public.referrals values ('${VIOLET}', '${FRIEND}', 'pending', null)`);
    await db.exec(`update auth.users set email_confirmed_at = now() where id = '${FRIEND}'`);
    const status = await db.query(`select status from public.referrals where referred_user_id = '${FRIEND}'`);
    assert.equal(status.rows[0].status, 'verified');
    const calls = await db.query(`select user_id from public.refresh_calls`);
    assert.deepEqual(calls.rows.map((r) => r.user_id), [VIOLET]);
  } finally { await db.close(); }
});

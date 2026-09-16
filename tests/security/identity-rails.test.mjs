import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const a='00000000-0000-0000-0000-00000000000a';

test('0078 identity rails: pronouns+status_note on profiles, notifications.seen_at, never touched the theme fix, idempotent', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table profiles(id uuid primary key, username text unique, display_name text, avatar_url text, bio text);
      create table notifications(id uuid primary key default gen_random_uuid(), user_id uuid, type text, title text, body text, link text, seen_at timestamptz);
      create table referral_codes(user_id uuid primary key, code text unique);
      create function public.get_theme() returns jsonb language plpgsql as $$ begin return '{"plan":"aero","entitled":true}'::jsonb; end $$;
      create function public.get_entitlement(uuid) returns jsonb language sql as $$ select '{"plan":"aero"}'::jsonb $$;`);
    // Load 0078 twice: idempotent, and afterwards the columns must exist.
    for (let i=0;i<2;i++) await db.exec(await readFile('supabase/migrations/0078_identity_rails.sql','utf8'));
    await db.query('insert into profiles(id,username,display_name) values($1,$2,$3)',[a,'ada','Ada']);
    await db.query('update profiles set pronouns=$1, status_note=$2 where id=$3',['she/her','Taking a tiny break',a]);
    const p=(await db.query('select pronouns,status_note from profiles where id=$1',[a])).rows[0];
    assert.equal(p.pronouns,'she/her'); assert.equal(p.status_note,'Taking a tiny break');
    // seen_at default-stays-null for an item the user never opened; badge derives from null.
    const n=(await db.query(`insert into notifications(user_id,type,title) values($1,'dm','hi') returning seen_at`,[a])).rows[0];
    assert.equal(n.seen_at,null);
    await db.query('update notifications set seen_at=now() where user_id=$1',[a]);
    assert.equal((await db.query('select seen_at is not null as seen from notifications where user_id=$1',[a])).rows[0].seen,true);
    // Unread count (badge) survives reload because it lives on the row, not a hook.
    const unread=(await db.query('select count(*)::int as c from notifications where user_id=$1 and seen_at is null',[a])).rows[0].c;
    assert.equal(unread,0);
    // The aero theme fix (0076, applied live earlier) must not have regressed.
    assert.equal((await db.query('select public.get_theme() ->> \'entitled\' as e')).rows[0].e,'true');
  } finally { await db.close(); }
});

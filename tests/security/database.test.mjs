import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const buyer='00000000-0000-0000-0000-000000000001', seller='00000000-0000-0000-0000-000000000002', other='00000000-0000-0000-0000-000000000003';

test('security migration: server-only privileges survive the mascot teardown; tenure stays idempotent', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table profiles(id uuid primary key);
      create table servers(id uuid primary key);
      create table channels(id uuid primary key,server_id uuid references servers(id),read_only boolean default false);
      create table server_members(server_id uuid,user_id uuid);
      create table account_restrictions(user_id uuid,restriction text);
      create function public.is_platform_banned() returns boolean language sql as $$ select false $$;
      create function public.channel_effective_permission(uuid,text) returns boolean language sql as $$ select true $$;
      create function public.platform_rate_limit(text,integer,integer) returns void language sql as $$ select $$;
      create function public.bot_send_message(uuid,uuid,text,uuid) returns void language sql as $$ select $$;
      grant execute on function public.bot_send_message(uuid,uuid,text,uuid) to authenticated;
      create table tenure(user_id uuid primary key,months int default 0);
      create function public.accrue_tenure_month(p_user uuid) returns void language sql as $$ insert into tenure values(p_user,1) on conflict(user_id) do update set months=tenure.months+1 $$;
      insert into profiles values('${buyer}'),('${seller}'),('${other}');`);
    for (const file of ['0062_mascots.sql','0063_mascots_profile_images.sql','0064_security_and_mascot_payments.sql']) await db.exec(await readFile(`supabase/migrations/${file}`,'utf8'));

    await db.exec(await readFile('supabase/migrations/0071_remove_mascots.sql','utf8'));
    await db.exec(await readFile('supabase/migrations/0071_remove_mascots.sql','utf8'));

    for (const table of ['mascots','mascot_species','mascot_purchases','mascot_sales','mascot_grants','mascot_messages','account_credits','credit_ledger','mascot_art_drafts','mascot_wallets','mascot_wallet_entries','mascot_wallet_deposits','mascot_wallet_trades','mascot_wallet_earnings','mascot_wallet_withdrawals'])
      assert.equal((await db.query('select to_regclass($1) is null as gone',['public.'+table])).rows[0].gone,true,table);
    for (const signature of ['public.list_mascot(uuid,integer)','public.unlist_mascot(uuid)','public.rename_mascot(uuid,text)','public.train_mascot(uuid,integer)','public.add_mascot_grant(uuid,uuid,uuid,boolean,boolean,jsonb)','public.remove_mascot_grant(uuid)','public.mascot_send_message(uuid,uuid,text)','public.credit_user(uuid,integer,text,uuid,integer)','public.fulfill_mascot_purchase(uuid,text,integer)','public.fulfill_mascot_sale(uuid,text,integer)','public.wallet_prepare(uuid)','public.wallet_debit(uuid,integer)','public.wallet_mint(uuid,uuid,integer)','public.wallet_buy(uuid,uuid,integer,uuid)','public.wallet_snapshot(uuid)','public.mascot_market_history(uuid)','public.mascot_account_activity(uuid,integer)','public.mascot_trade_name_snapshot()'])
      assert.equal((await db.query('select to_regprocedure($1) is null as gone',[signature])).rows[0].gone,true,signature);

    for (const signature of ['bot_send_message(uuid,uuid,text,uuid)','platform_rate_limit(text,integer,integer)','accrue_tenure_invoice(uuid,text)']) {
      for (const role of ['anon','authenticated']) assert.equal((await db.query('select has_function_privilege($1,$2,\'EXECUTE\') as allowed',[role, signature])).rows[0].allowed,false,`${role} ${signature}`);
      assert.equal((await db.query('select has_function_privilege(\'service_role\',$1,\'EXECUTE\') as allowed',[signature])).rows[0].allowed,true);
    }

    await db.query("select accrue_tenure_invoice($1,'in_once')",[buyer]); await db.query("select accrue_tenure_invoice($1,'in_once')",[buyer]);
    assert.equal((await db.query('select months from tenure')).rows[0].months,1);
  } finally { await db.close(); }
});

test('referrals: code minting, email-verified counting, self/dupe guards, leaderboard', async () => {
  const db = new PGlite();
  const referrer='00000000-0000-0000-0000-0000000000aa', friend='00000000-0000-0000-0000-0000000000bb', loner='00000000-0000-0000-0000-0000000000cc';
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table profiles(id uuid primary key, username text unique, display_name text, avatar_url text);
      create table platform_bans(user_id uuid);
      create function public.resolve_username(p_meta text, p_fallback text, p_email text, p_id uuid) returns text language sql as $$ select coalesce(nullif(trim(p_meta),''), nullif(trim(p_fallback),''), split_part(p_email,'@',1), 'user') $$;
      create function public.assert_username_available(p_username text, p_id uuid) returns void language sql as $$ select $$;
      create table auth.users(
        id uuid primary key default gen_random_uuid(),
        email text,
        email_confirmed_at timestamptz,
        raw_user_meta_data jsonb
      );`);
    await db.exec(await readFile('supabase/migrations/0077_referrals.sql','utf8'));

    await db.exec('create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user()');

    await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,'a@a.dev','{\"username\":\"alice\"}')",[referrer]);
    const code=(await db.query('select code from referral_codes where user_id=$1',[referrer])).rows[0].code;
    assert.match(code,/^[0-9a-zA-Z]{9}$/);

    await db.query(`insert into auth.users(id,email,raw_user_meta_data) values($1,'b@b.dev','{"username":"bob","referral_code":"${code}"}')`,[friend]);
    let rows=(await db.query('select status from referrals where referred_user_id=$1',[friend])).rows;
    assert.equal(rows.length,1); assert.equal(rows[0].status,'pending');

    let board=(await db.query('select * from referral_leaderboard()')).rows;
    assert.equal(board.length,0);

    await db.query('update auth.users set email_confirmed_at=now() where id=$1',[friend]);
    await db.query('update auth.users set email_confirmed_at=now() where id=$1',[friend]);
    rows=(await db.query('select status, verified_at is not null as stamped from referrals where referred_user_id=$1',[friend])).rows;
    assert.equal(rows[0].status,'verified'); assert.equal(rows[0].stamped,true);
    board=(await db.query('select display_name, code, verified_count from referral_leaderboard()')).rows;
    assert.equal(board.length,1); assert.equal(board[0].code,code); assert.equal(Number(board[0].verified_count),1);

    await db.exec(`insert into platform_bans values('${referrer}')`);
    assert.equal((await db.query('select * from referral_leaderboard()')).rows.length,0);
    await db.exec('delete from platform_bans');

    await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,'c@c.dev','{\"username\":\"carol\",\"referral_code\":\"zzzzzzzzz\"}')",[loner]);
    assert.equal((await db.query('select * from referrals where referred_user_id=$1',[loner])).rows.length,0);

    await assert.rejects(db.query('insert into referrals(referrer_id,referred_user_id) values($1,$1)',[referrer]),/violates check constraint "referrals_no_self"/);
    await assert.rejects(db.query('insert into referrals(referrer_id,referred_user_id) values($1,$2)',[referrer,friend]),/duplicate key/);

    for (const signature of ['referral_leaderboard(integer,timestamptz,timestamptz)']) {
      for (const role of ['anon','authenticated']) assert.equal((await db.query('select has_function_privilege($1,$2,\'EXECUTE\') as allowed',[role, signature])).rows[0].allowed,true,`${role} ${signature}`);
    }
    for (const signature of ['generate_referral_code()','on_referral_verified()']) {
      for (const role of ['anon','authenticated']) assert.equal((await db.query('select has_function_privilege($1,$2,\'EXECUTE\') as allowed',[role, signature])).rows[0].allowed,false,`${role} ${signature}`);
    }
  } finally { await db.close(); }
});

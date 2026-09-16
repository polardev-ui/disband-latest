-- Disband collectible wallet. Apply after 0062–0065 and existing app migrations.
-- No existing account_credits are converted: those credits are not verified deposits.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('mascot-art','mascot-art',true,12582912,array['image/webp']) on conflict(id) do nothing;
alter table public.mascots add column if not exists image_archived boolean not null default false;
create table if not exists public.mascot_art_drafts (
 id uuid primary key, buyer_id uuid not null references public.profiles(id), name text not null check(length(name) between 1 and 32),
 species text not null, seed text not null, rarity text not null, traits jsonb not null,
 fingerprint text not null unique, profile_image text not null, created_at timestamptz not null default now(),
 minted_id uuid unique references public.mascots(id)
);
create table if not exists public.mascot_wallets (
 user_id uuid primary key references public.profiles(id), deposited_cents bigint not null default 0 check(deposited_cents>=0),
 earned_cents bigint not null default 0 check(earned_cents>=0), frozen boolean not null default false,
 stripe_account_id text unique, updated_at timestamptz not null default now()
);
create table if not exists public.mascot_wallet_entries (
 id bigint generated always as identity primary key,user_id uuid not null references public.profiles(id),
 kind text not null, amount_cents bigint not null, reference_id text not null, created_at timestamptz not null default now(),
 unique(user_id,kind,reference_id)
);
create table if not exists public.mascot_wallet_deposits (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),
 amount_cents integer not null check(amount_cents between 100 and 100000),
 stripe_session_id text unique,payment_intent_id text unique,status text not null default 'pending' check(status in('pending','credited','review')),
 created_at timestamptz not null default now()
);
create table if not exists public.mascot_wallet_trades (
 id uuid primary key default gen_random_uuid(),request_key uuid not null,buyer_id uuid not null references public.profiles(id),
 seller_id uuid not null references public.profiles(id),mascot_id uuid not null references public.mascots(id),
 amount_cents integer not null check(amount_cents>0), created_at timestamptz not null default now(),unique(buyer_id,request_key)
);
create table if not exists public.mascot_wallet_earnings (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),
 trade_id uuid unique not null references public.mascot_wallet_trades(id),amount_cents integer not null check(amount_cents>0),
 available_at timestamptz not null,released_at timestamptz
);
create table if not exists public.mascot_wallet_withdrawals (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),request_key uuid not null,
 gross_cents integer not null check(gross_cents between 100 and 100000),fee_cents integer not null,net_cents integer not null,
 status text not null default 'reserved' check(status in('reserved','transferred','submitted','paid','failed','review')),
 stripe_transfer_id text unique,stripe_payout_id text unique,created_at timestamptz not null default now(),
 unique(user_id,request_key),check(gross_cents=fee_cents+net_cents),check(fee_cents=round(gross_cents::numeric*0.20)::integer)
);
create index if not exists mascot_entries_user_date on public.mascot_wallet_entries(user_id,created_at desc);
create index if not exists mascot_earnings_release on public.mascot_wallet_earnings(user_id,available_at) where released_at is null;
create index if not exists mascot_trades_mascot_date on public.mascot_wallet_trades(mascot_id,created_at desc);

do $$ declare t text; begin
 foreach t in array array['mascot_art_drafts','mascot_wallets','mascot_wallet_entries','mascot_wallet_deposits','mascot_wallet_trades','mascot_wallet_earnings','mascot_wallet_withdrawals'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
grant select on public.mascot_art_drafts,public.mascot_wallets,public.mascot_wallet_entries,public.mascot_wallet_deposits,public.mascot_wallet_earnings,public.mascot_wallet_withdrawals to authenticated;
drop policy if exists own_drafts on public.mascot_art_drafts;
create policy own_drafts on public.mascot_art_drafts for select to authenticated using(buyer_id=auth.uid());
do $$ declare t text; begin
 foreach t in array array['mascot_wallets','mascot_wallet_entries','mascot_wallet_deposits','mascot_wallet_earnings','mascot_wallet_withdrawals'] loop
  execute format('drop policy if exists own_wallet on public.%I',t);
  execute format('create policy own_wallet on public.%I for select to authenticated using(user_id=auth.uid())',t);
 end loop;
end $$;

-- Internal helpers take an explicit, server-authenticated actor. Never expose to clients.
create or replace function public.wallet_prepare(p_user uuid) returns void language plpgsql security definer set search_path=public as $$
declare amount bigint;
begin
 if exists(select 1 from public.platform_bans where user_id=p_user) then raise exception 'Account restricted'; end if;
 insert into public.mascot_wallets(user_id) values(p_user) on conflict do nothing;
 perform 1 from public.mascot_wallets where user_id=p_user for update;
 if exists(select 1 from public.mascot_wallets where user_id=p_user and frozen) then raise exception 'Wallet under review'; end if;
 with released as(update public.mascot_wallet_earnings set released_at=now() where user_id=p_user and released_at is null and available_at<=now() returning amount_cents)
 select coalesce(sum(amount_cents),0) into amount from released;
 update public.mascot_wallets set earned_cents=earned_cents+amount,updated_at=now() where user_id=p_user;
end $$;
create or replace function public.wallet_debit(p_user uuid,p_cents integer) returns void language plpgsql security definer set search_path=public as $$
declare w public.mascot_wallets%rowtype; d bigint;
begin
 if p_cents is null or p_cents<=0 then raise exception 'Invalid amount'; end if;
 select * into w from public.mascot_wallets where user_id=p_user for update;
 if not found or w.frozen or w.deposited_cents+w.earned_cents<p_cents then raise exception 'Insufficient available balance'; end if;
 d:=least(w.deposited_cents,p_cents);
 update public.mascot_wallets set deposited_cents=deposited_cents-d,earned_cents=earned_cents-(p_cents-d),updated_at=now() where user_id=p_user;
end $$;
create or replace function public.wallet_credit_deposit(p_id uuid,p_session text,p_intent text,p_amount integer) returns void language plpgsql security definer set search_path=public as $$
declare d public.mascot_wallet_deposits%rowtype;
begin
 select * into d from public.mascot_wallet_deposits where id=p_id for update;
 if not found or p_amount is distinct from d.amount_cents or p_session is null or p_intent is null or(d.stripe_session_id is not null and d.stripe_session_id<>p_session) then raise exception 'Deposit mismatch'; end if;
 if d.status<>'pending' then return; end if;
 insert into public.mascot_wallets(user_id) values(d.user_id) on conflict do nothing;
 update public.mascot_wallets set deposited_cents=deposited_cents+d.amount_cents where user_id=d.user_id;
 update public.mascot_wallet_deposits set status='credited',stripe_session_id=p_session,payment_intent_id=p_intent where id=d.id;
 insert into public.mascot_wallet_entries(user_id,kind,amount_cents,reference_id) values(d.user_id,'deposit',d.amount_cents,d.id::text);
end $$;
create or replace function public.wallet_mint(p_user uuid,p_draft uuid,p_price integer) returns uuid language plpgsql security definer set search_path=public as $$
declare d public.mascot_art_drafts%rowtype; result uuid;
begin
 select * into d from public.mascot_art_drafts where id=p_draft and buyer_id=p_user for update;
 if not found then raise exception 'Design not found'; end if;
 if d.minted_id is not null then return d.minted_id; end if;
 if d.created_at<now()-interval '24 hours' then raise exception 'Design expired. Generate a new one'; end if;
 perform public.wallet_prepare(p_user); perform public.wallet_debit(p_user,p_price);
 insert into public.mascots(species,owner_id,name,seed,fingerprint,rarity,traits,profile_image,image_archived)
 values(d.species,p_user,d.name,d.seed,d.fingerprint,d.rarity,d.traits,d.profile_image,true) returning id into result;
 update public.mascot_art_drafts set minted_id=result where id=d.id;
 insert into public.mascot_wallet_entries(user_id,kind,amount_cents,reference_id) values(p_user,'creation',-p_price,d.id::text);
 return result;
end $$;
create or replace function public.wallet_buy(p_user uuid,p_mascot uuid,p_expected integer,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare m public.mascots%rowtype;t public.mascot_wallet_trades%rowtype;
begin
 if p_request is null then raise exception 'Request ID required'; end if;
 -- Serialize replays before choosing an owner; mascot lock serializes competing buyers.
 perform pg_advisory_xact_lock(hashtextextended(p_user::text||p_request::text,0));
 select * into t from public.mascot_wallet_trades where buyer_id=p_user and request_key=p_request;
 if found then if t.mascot_id<>p_mascot or t.amount_cents<>p_expected then raise exception 'Request ID reused'; end if; return t.id; end if;
 select * into m from public.mascots where id=p_mascot for update;
 if not found or m.owner_id=p_user or m.listed_price_cents is null or m.listed_price_cents is distinct from p_expected or not m.image_archived then raise exception 'Listing changed or image not archived'; end if;
 insert into public.mascot_wallets(user_id) values(p_user),(m.owner_id) on conflict do nothing;
 perform 1 from public.mascot_wallets where user_id in(p_user,m.owner_id) order by user_id for update;
 perform public.wallet_prepare(p_user);perform public.wallet_prepare(m.owner_id);
 perform public.wallet_debit(p_user,m.listed_price_cents);
 insert into public.mascot_wallet_trades(request_key,buyer_id,seller_id,mascot_id,amount_cents) values(p_request,p_user,m.owner_id,m.id,m.listed_price_cents) returning * into t;
 -- A seven-day release is a risk hold, not a guarantee against later chargebacks.
 insert into public.mascot_wallet_earnings(user_id,trade_id,amount_cents,available_at) values(m.owner_id,t.id,m.listed_price_cents,now()+interval '7 days');
 insert into public.mascot_wallet_entries(user_id,kind,amount_cents,reference_id) values(p_user,'purchase',-m.listed_price_cents,t.id::text),(m.owner_id,'sale_pending',m.listed_price_cents,t.id::text);
 update public.mascots set owner_id=p_user,listed_price_cents=null,listed_at=null where id=m.id;
 delete from public.mascot_grants where mascot_id=m.id;
 return t.id;
end $$;
create or replace function public.wallet_reserve_withdrawal(p_user uuid,p_amount integer,p_request uuid) returns public.mascot_wallet_withdrawals language plpgsql security definer set search_path=public as $$
declare result public.mascot_wallet_withdrawals%rowtype; fee integer;
begin
 if p_amount is null or p_amount<100 or p_amount>100000 or p_request is null then raise exception 'Withdrawal must be $1–$1,000'; end if;
 perform public.wallet_prepare(p_user);
 select * into result from public.mascot_wallet_withdrawals where user_id=p_user and request_key=p_request;
 if found then if result.gross_cents<>p_amount then raise exception 'Request ID reused'; end if; return result; end if;
 -- Deposited money is spend-only. Only settled marketplace earnings can cash out.
 update public.mascot_wallets set earned_cents=earned_cents-p_amount where user_id=p_user and earned_cents>=p_amount and stripe_account_id is not null;
 if not found then raise exception 'Insufficient settled earnings or payout account missing'; end if;
 fee:=round(p_amount::numeric*0.20)::integer;
 insert into public.mascot_wallet_withdrawals(user_id,request_key,gross_cents,fee_cents,net_cents) values(p_user,p_request,p_amount,fee,p_amount-fee) returning * into result;
 insert into public.mascot_wallet_entries(user_id,kind,amount_cents,reference_id) values(p_user,'withdrawal_reserved',-p_amount,result.id::text);
 return result;
end $$;
-- Refunds/disputes freeze the affected wallet and unpaid sellers for investigation.
-- A balance is never invented or automatically re-credited from an uncertain payout.
create or replace function public.wallet_review_payment(p_intent text) returns void language plpgsql security definer set search_path=public as $$
declare u uuid;
begin
 update public.mascot_wallet_deposits set status='review' where payment_intent_id=p_intent returning user_id into u;
 if u is null then return; end if;
 update public.mascot_wallets set frozen=true where user_id=u or user_id in(select seller_id from public.mascot_wallet_trades where buyer_id=u);
end $$;
create or replace function public.wallet_snapshot(p_user uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare w public.mascot_wallets%rowtype; pending bigint;
begin
 insert into public.mascot_wallets(user_id) values(p_user) on conflict do nothing;
 if not exists(select 1 from public.mascot_wallets where user_id=p_user and frozen) then perform public.wallet_prepare(p_user); end if;
 select * into w from public.mascot_wallets where user_id=p_user;
 select coalesce(sum(amount_cents),0) into pending from public.mascot_wallet_earnings where user_id=p_user and released_at is null;
 return jsonb_build_object('depositedCents',w.deposited_cents,'earnedCents',w.earned_cents,'pendingCents',pending,'frozen',w.frozen,'connected',w.stripe_account_id is not null);
end $$;
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'wallet\_%' escape '\' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;

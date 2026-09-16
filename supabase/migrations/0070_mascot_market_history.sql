-- Apply after 0069. Higher USD limits, sale-name snapshots and private activity.
begin;
alter table public.mascot_wallet_deposits drop constraint if exists mascot_wallet_deposits_amount_cents_check;
alter table public.mascot_wallet_deposits add constraint mascot_wallet_deposits_amount_cents_check check(amount_cents between 100 and 2500000);
alter table public.mascot_wallet_withdrawals drop constraint if exists mascot_wallet_withdrawals_gross_cents_check;
alter table public.mascot_wallet_withdrawals add constraint mascot_wallet_withdrawals_gross_cents_check check(gross_cents between 100 and 2500000);
alter table public.mascot_wallet_trades add column if not exists mascot_name text;
update public.mascot_wallet_trades t set mascot_name=m.name from public.mascots m where m.id=t.mascot_id and t.mascot_name is null;
create or replace function public.mascot_trade_name_snapshot() returns trigger
language plpgsql set search_path=public as $$
begin
 select name into new.mascot_name from public.mascots where id=new.mascot_id;
 return new;
end $$;
drop trigger if exists mascot_trade_name_snapshot on public.mascot_wallet_trades;
create trigger mascot_trade_name_snapshot before insert on public.mascot_wallet_trades for each row execute function public.mascot_trade_name_snapshot();
revoke all on function public.mascot_trade_name_snapshot() from public,anon,authenticated;

create or replace function public.list_mascot(p_mascot_id uuid,p_price_cents integer) returns boolean
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or public.is_platform_banned() then raise exception 'Not authorized'; end if;
 if p_price_cents is null or p_price_cents<100 or p_price_cents>2500000 then raise exception 'Price must be $1–$25,000'; end if;
 if exists(select 1 from public.mascot_wallets where user_id=auth.uid() and frozen) then raise exception 'Wallet under review'; end if;
 update public.mascots set listed_price_cents=p_price_cents,listed_at=now()
 where id=p_mascot_id and owner_id=auth.uid() and image_archived;
 if not found then raise exception 'Mascot is not yours or has no archived artwork'; end if;
 return true;
end $$;
revoke all on function public.list_mascot(uuid,integer) from public,anon;
grant execute on function public.list_mascot(uuid,integer) to authenticated;

create or replace function public.wallet_reserve_withdrawal(p_user uuid,p_amount integer,p_request uuid) returns public.mascot_wallet_withdrawals
language plpgsql security definer set search_path=public as $$
declare result public.mascot_wallet_withdrawals%rowtype; fee integer;
begin
 if p_amount is null or p_amount<100 or p_amount>2500000 or p_request is null then raise exception 'Withdrawal must be $1–$25,000'; end if;
 perform public.wallet_prepare(p_user);
 select * into result from public.mascot_wallet_withdrawals where user_id=p_user and request_key=p_request;
 if found then if result.gross_cents<>p_amount then raise exception 'Request ID reused'; end if; return result; end if;
 update public.mascot_wallets set earned_cents=earned_cents-p_amount where user_id=p_user and earned_cents>=p_amount and stripe_account_id is not null;
 if not found then raise exception 'Insufficient settled earnings or payout account missing'; end if;
 fee:=round(p_amount::numeric*0.20)::integer;
 insert into public.mascot_wallet_withdrawals(user_id,request_key,gross_cents,fee_cents,net_cents)
 values(p_user,p_request,p_amount,fee,p_amount-fee) returning * into result;
 insert into public.mascot_wallet_entries(user_id,kind,amount_cents,reference_id) values(p_user,'withdrawal_reserved',-p_amount,result.id::text);
 return result;
end $$;

-- Public market facts contain no account identifiers, emails, or wallet data.
-- Server authentication is required by the API; raw RPCs stay service-only.
create or replace function public.mascot_market_history(p_mascot uuid) returns jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_build_object(
  'count',count(*),'volumeCents',coalesce(sum(amount_cents),0),
  'lastPriceCents',(select amount_cents from public.mascot_wallet_trades where mascot_id=p_mascot order by created_at desc,id desc limit 1),
  'trades',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',mascot_name,'amountCents',amount_cents,'createdAt',created_at) order by created_at desc,id desc)
   from(select * from public.mascot_wallet_trades where mascot_id=p_mascot order by created_at desc,id desc limit 30)t),'[]'::jsonb))
 from public.mascot_wallet_trades where mascot_id=p_mascot;
$$;
create index if not exists mascot_trades_buyer_date on public.mascot_wallet_trades(buyer_id,created_at desc);
create index if not exists mascot_trades_seller_date on public.mascot_wallet_trades(seller_id,created_at desc);
create or replace function public.mascot_account_activity(p_user uuid,p_page integer default 0) returns jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_build_object(
  'boughtCents',coalesce(sum(amount_cents) filter(where buyer_id=p_user),0),
  'soldCents',coalesce(sum(amount_cents) filter(where seller_id=p_user),0),
  'count',count(*),
  'trades',coalesce((select jsonb_agg(jsonb_build_object('id',id,'mascotId',mascot_id,'name',mascot_name,'amountCents',amount_cents,'createdAt',created_at,
    'side',case when buyer_id=p_user then 'buy' else 'sell' end) order by created_at desc,id desc)
   from(select * from public.mascot_wallet_trades where buyer_id=p_user or seller_id=p_user order by created_at desc,id desc limit 30 offset least(greatest(p_page,0),10000)*30)t),'[]'::jsonb))
 from public.mascot_wallet_trades where buyer_id=p_user or seller_id=p_user;
$$;
revoke all on function public.wallet_reserve_withdrawal(uuid,integer,uuid),public.mascot_market_history(uuid),public.mascot_account_activity(uuid,integer) from public,anon,authenticated;
grant execute on function public.wallet_reserve_withdrawal(uuid,integer,uuid),public.mascot_market_history(uuid),public.mascot_account_activity(uuid,integer) to service_role;
commit;

-- Apply after 0068. Webhook ordering must not make refunded funds spendable.
begin;
create table if not exists public.mascot_wallet_payment_reviews (
 payment_intent_id text primary key,
 created_at timestamptz not null default now()
);
alter table public.mascot_wallet_payment_reviews enable row level security;
revoke all on public.mascot_wallet_payment_reviews from public,anon,authenticated;
grant all on public.mascot_wallet_payment_reviews to service_role;

create or replace function public.wallet_review_payment(p_intent text) returns void
language plpgsql security definer set search_path=public as $$
declare u uuid;
begin
 if p_intent is null or length(p_intent)=0 then raise exception 'Missing payment intent'; end if;
 perform pg_advisory_xact_lock(hashtextextended('wallet-payment:'||p_intent,0));
 insert into public.mascot_wallet_payment_reviews(payment_intent_id) values(p_intent) on conflict do nothing;
 update public.mascot_wallet_deposits set status='review' where payment_intent_id=p_intent returning user_id into u;
 if u is not null then
  update public.mascot_wallets set frozen=true where user_id=u or user_id in(select seller_id from public.mascot_wallet_trades where buyer_id=u);
 end if;
end $$;

create or replace function public.wallet_credit_deposit(p_id uuid,p_session text,p_intent text,p_amount integer) returns void
language plpgsql security definer set search_path=public as $$
declare d public.mascot_wallet_deposits%rowtype;
begin
 if p_intent is null or length(p_intent)=0 then raise exception 'Missing payment intent'; end if;
 perform pg_advisory_xact_lock(hashtextextended('wallet-payment:'||p_intent,0));
 select * into d from public.mascot_wallet_deposits where id=p_id for update;
 if not found or p_amount is distinct from d.amount_cents or p_session is null
 or(d.stripe_session_id is not null and d.stripe_session_id<>p_session)
 or(d.payment_intent_id is not null and d.payment_intent_id<>p_intent) then raise exception 'Deposit mismatch'; end if;
 if d.status<>'pending' then return; end if;
 insert into public.mascot_wallets(user_id) values(d.user_id) on conflict do nothing;
 if exists(select 1 from public.mascot_wallet_payment_reviews where payment_intent_id=p_intent) then
  update public.mascot_wallet_deposits set status='review',stripe_session_id=p_session,payment_intent_id=p_intent where id=d.id;
  update public.mascot_wallets set frozen=true where user_id=d.user_id;
  return;
 end if;
 update public.mascot_wallets set deposited_cents=deposited_cents+d.amount_cents where user_id=d.user_id;
 update public.mascot_wallet_deposits set status='credited',stripe_session_id=p_session,payment_intent_id=p_intent where id=d.id;
 insert into public.mascot_wallet_entries(user_id,kind,amount_cents,reference_id) values(d.user_id,'deposit',d.amount_cents,d.id::text);
end $$;

-- Reconcile a successful Stripe transfer even if the HTTP response/DB update
-- was interrupted. Every monetary field and the destination are checked.
create or replace function public.wallet_confirm_transfer(p_id uuid,p_transfer text,p_destination text,p_net integer) returns void
language plpgsql security definer set search_path=public as $$
declare w public.mascot_wallet_withdrawals%rowtype; destination text;
begin
 select * into w from public.mascot_wallet_withdrawals where id=p_id for update;
 if not found then raise exception 'Withdrawal not found'; end if;
 select stripe_account_id into destination from public.mascot_wallets where user_id=w.user_id;
 if p_transfer is null or length(p_transfer)=0 or p_net is distinct from w.net_cents
 or p_destination is distinct from destination or destination is null then raise exception 'Transfer mismatch'; end if;
 if w.stripe_transfer_id is not null then
  if w.stripe_transfer_id<>p_transfer then raise exception 'Unexpected duplicate transfer'; end if;
  return;
 end if;
 if w.status<>'reserved' then raise exception 'Withdrawal requires reconciliation'; end if;
 update public.mascot_wallet_withdrawals set stripe_transfer_id=p_transfer,status='transferred' where id=w.id;
end $$;

revoke all on function public.wallet_review_payment(text),public.wallet_credit_deposit(uuid,text,text,integer),public.wallet_confirm_transfer(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.wallet_review_payment(text),public.wallet_credit_deposit(uuid,text,text,integer),public.wallet_confirm_transfer(uuid,text,text,integer) to service_role;

update public.mascot_species set tagline='A diamond core. Energy in every direction.',trait_pool='["split_prism","orbital_shards","twin_arrowheads","hollow_core","offset_crown","broken_symmetry","double_diamond","needle_points"]'::jsonb where key='spark';
update public.mascot_species set tagline='A floating crest. Grounded by two sharp anchors.',trait_pool='["floating_crown","split_anchors","long_arch","hollow_crest","tiered_legs","cutout_wings","twin_prisms","sharp_feet"]'::jsonb where key='tether';
commit;

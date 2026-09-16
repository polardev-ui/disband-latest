-- Apply after 0062 and 0063. Transactional, safe to run again.
begin;

-- 0054 accidentally restored authenticated EXECUTE on server-only functions.
-- Revoke every overload by identity, including functions present only in live DBs.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
    and (p.proname like 'bot\_%' escape '\' or p.proname in
      ('credit_user', 'accrue_tenure_month', 'platform_rate_limit', 'notify_push',
       'record_signup_ip_block', 'is_signup_ip_blocked', 'write_audit_log', 'is_blocked_between'))
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.signature);
    execute format('grant execute on function %s to service_role', f.signature);
  end loop;
end $$;

create index if not exists mascots_owner_minted_idx on public.mascots(owner_id, minted_at desc);
create index if not exists mascots_market_idx on public.mascots(listed_at desc) where listed_price_cents is not null;
create index if not exists mascot_sales_buyer_idx on public.mascot_sales(buyer_id, created_at desc);
create index if not exists mascot_sales_seller_idx on public.mascot_sales(seller_id, created_at desc);
create index if not exists mascot_purchases_buyer_idx on public.mascot_purchases(buyer_id, created_at desc);

alter table public.mascot_purchases drop constraint if exists mascot_purchases_status_check;
alter table public.mascot_purchases add constraint mascot_purchases_status_check
  check (status in ('pending','paid','minted','refund_pending','refunded'));
alter table public.mascot_sales drop constraint if exists mascot_sales_status_check;
alter table public.mascot_sales add constraint mascot_sales_status_check
  check (status in ('pending','paid','applied','refund_pending','failed'));
alter table public.mascots add column if not exists last_trained_at timestamptz;

create or replace function public.fulfill_mascot_purchase(p_order_id uuid, p_session_id text, p_amount_cents integer)
returns text language plpgsql security definer set search_path = public as $$
declare p public.mascot_purchases%rowtype;
begin
  select * into p from public.mascot_purchases where id = p_order_id for update;
  if not found then raise exception 'Purchase not found'; end if;
  if p_session_id is null or p_session_id not like 'cs_%' or p_amount_cents is null
     or p_amount_cents <> p.amount_cents or p_amount_cents <= 0
     or (p.stripe_session_id is not null and p.stripe_session_id <> p_session_id)
  then raise exception 'Payment does not match purchase'; end if;
  if p.status = 'minted' or p.status = 'refunded' then return 'fulfilled'; end if;
  if p.status = 'refund_pending' then return 'refund_required'; end if;
  update public.mascot_purchases set stripe_session_id = p_session_id where id = p.id;
  begin
    insert into public.mascots(species,owner_id,name,seed,fingerprint,rarity,traits,profile_image)
    values(p.species,p.buyer_id,p.name,p.seed,p.fingerprint,p.rarity,p.traits,p.profile_image);
  exception when unique_violation then
    update public.mascot_purchases set status = 'refund_pending' where id = p.id;
    return 'refund_required';
  end;
  update public.mascot_purchases set status = 'minted' where id = p.id;
  return 'fulfilled';
end $$;

create or replace function public.fulfill_mascot_sale(p_order_id uuid, p_session_id text, p_amount_cents integer)
returns text language plpgsql security definer set search_path = public as $$
declare s public.mascot_sales%rowtype; m public.mascots%rowtype;
begin
  select * into s from public.mascot_sales where id = p_order_id for update;
  if not found then raise exception 'Sale not found'; end if;
  if p_session_id is null or p_session_id not like 'cs_%' or p_amount_cents is null
     or p_amount_cents <> s.amount_cents or p_amount_cents <= 0
     or (s.stripe_session_id is not null and s.stripe_session_id <> p_session_id)
  then raise exception 'Payment does not match sale'; end if;
  if s.status = 'applied' or s.status = 'failed' then return 'fulfilled'; end if;
  if s.status = 'refund_pending' then return 'refund_required'; end if;
  update public.mascot_sales set stripe_session_id = p_session_id where id = s.id;
  select * into m from public.mascots where id = s.mascot_id for update;
  if not found or m.owner_id <> s.seller_id or m.listed_price_cents is distinct from s.amount_cents
     or s.buyer_id = s.seller_id then
    update public.mascot_sales set status = 'refund_pending' where id = s.id;
    return 'refund_required';
  end if;
  update public.mascots set owner_id = s.buyer_id, listed_price_cents = null, listed_at = null where id = m.id;
  delete from public.mascot_grants where mascot_id = m.id;
  perform public.credit_user(s.seller_id, round(s.amount_cents::numeric * 0.9)::integer, 'mascot_sale', m.id, s.amount_cents);
  update public.mascot_sales set status = 'applied' where id = s.id;
  return 'fulfilled';
end $$;

revoke all on function public.fulfill_mascot_purchase(uuid,text,integer) from public, anon, authenticated;
revoke all on function public.fulfill_mascot_sale(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.fulfill_mascot_purchase(uuid,text,integer) to service_role;
grant execute on function public.fulfill_mascot_sale(uuid,text,integer) to service_role;

-- Deduplicate paid months by invoice, across different webhook event IDs.
create table if not exists public.subscription_tenure_invoices (
  invoice_id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.subscription_tenure_invoices enable row level security;
revoke all on public.subscription_tenure_invoices from public, anon, authenticated;
grant all on public.subscription_tenure_invoices to service_role;
create or replace function public.accrue_tenure_invoice(p_user uuid, p_invoice_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_invoice_id is null or p_invoice_id not like 'in_%' then raise exception 'Invalid invoice'; end if;
  insert into public.subscription_tenure_invoices(invoice_id,user_id) values(p_invoice_id,p_user) on conflict do nothing;
  if found then perform public.accrue_tenure_month(p_user); end if;
end $$;
revoke all on function public.accrue_tenure_invoice(uuid,text) from public, anon, authenticated;
grant execute on function public.accrue_tenure_invoice(uuid,text) to service_role;

create or replace function public.list_mascot(
  p_mascot_id uuid,
  p_price_cents integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_platform_banned() then raise exception 'Not authorized'; end if;
  if p_price_cents is null or p_price_cents < 100 or p_price_cents > 100000 then
    raise exception 'Price must be between $1 and $1,000.';
  end if;
  if not exists (
    select 1 from public.mascots
    where id = p_mascot_id and owner_id = auth.uid()
  ) then
    raise exception 'Not your mascot.';
  end if;
  update public.mascots
    set listed_price_cents = p_price_cents, listed_at = now()
    where id = p_mascot_id and owner_id = auth.uid();
  return found;
end;
$$;

create or replace function public.unlist_mascot(p_mascot_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_platform_banned() then raise exception 'Not authorized'; end if;
  update public.mascots
    set listed_price_cents = null, listed_at = null
    where id = p_mascot_id and owner_id = auth.uid();
  return found;
end;
$$;

create or replace function public.rename_mascot(p_mascot_id uuid, p_name text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_platform_banned() then raise exception 'Not authorized'; end if;
  if p_name is null or length(btrim(p_name)) = 0 or length(btrim(p_name)) > 32 then
    raise exception 'Name must be between 1 and 32 characters.';
  end if;
  update public.mascots
    set name = btrim(p_name)
    where id = p_mascot_id and owner_id = auth.uid();
  return found;
end;
$$;

create or replace function public.train_mascot(p_mascot_id uuid, p_amount integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_platform_banned() then raise exception 'Not authorized'; end if;
  if p_amount is null or p_amount <> 12 then
    raise exception 'Training amount out of range.';
  end if;
  update public.mascots
    set xp = xp + 12,
        last_trained_at = now(),
        level = greatest(1, floor((xp + p_amount) / 100)::int + 1)
    where id = p_mascot_id and owner_id = auth.uid()
      and xp <= 2147483500
      and (last_trained_at is null or last_trained_at <= now() - interval '1 minute');
  if not found then raise exception 'Train once per minute; check that you own this mascot.'; end if;
  return found;
end;
$$;

create or replace function public.add_mascot_grant(
  p_mascot_id uuid,
  p_server_id uuid,
  p_channel_id uuid,
  p_can_post boolean default true,
  p_can_react boolean default true,
  p_rule jsonb default '{}'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_grant_id uuid;
begin
  if auth.uid() is null or public.is_platform_banned() then raise exception 'Not authorized'; end if;
  perform 1 from public.mascots where id = p_mascot_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Not your mascot'; end if;
  if pg_column_size(p_rule) > 4096 then raise exception 'Rule too large'; end if;
  if not exists (
    select 1 from public.mascots m
    join public.server_members sm on sm.server_id = p_server_id and sm.user_id = auth.uid()
    where m.id = p_mascot_id and m.owner_id = auth.uid()
  ) then
    raise exception 'Mascot owner must be a member of the server.';
  end if;
  if p_channel_id is not null and not exists (
    select 1 from public.channels c where c.id = p_channel_id and c.server_id = p_server_id
  ) then
    raise exception 'Channel does not belong to the server.';
  end if;
  if p_channel_id is null then
    delete from public.mascot_grants where mascot_id = p_mascot_id and server_id = p_server_id and channel_id is null;
  end if;
  insert into public.mascot_grants (mascot_id, server_id, channel_id, can_post, can_react, rule)
  values (p_mascot_id, p_server_id, p_channel_id, coalesce(p_can_post, true), coalesce(p_can_react, true), coalesce(p_rule, '{}'::jsonb))
  on conflict (mascot_id, server_id, channel_id)
  do update set can_post = excluded.can_post, can_react = excluded.can_react, rule = excluded.rule
  returning id into v_grant_id;
  return v_grant_id;
end;
$$;

create or replace function public.remove_mascot_grant(p_grant_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_platform_banned() then raise exception 'Not authorized'; end if;
  delete from public.mascot_grants g
  using public.mascots m
  where g.id = p_grant_id and g.mascot_id = m.id and m.owner_id = auth.uid();
  return found;
end;
$$;

create or replace function public.mascot_send_message(
  p_mascot_id uuid,
  p_channel_id uuid,
  p_body text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_server_id uuid;
  v_read_only boolean;
  v_grant uuid;
  v_message_id uuid;
begin
  if auth.uid() is null or public.is_platform_banned() then raise exception 'Not authorized'; end if;
  if exists(select 1 from public.account_restrictions where user_id = auth.uid() and restriction = 'send_messages') then raise exception 'Messaging restricted'; end if;
  perform public.platform_rate_limit('mascot-message:' || auth.uid()::text, 10, 60);
  perform 1 from public.mascots where id = p_mascot_id for update;
  if length(p_body) > 2000 then raise exception 'Message exceeds 2000 characters'; end if;
  if p_body is null or length(btrim(p_body)) = 0 then
    raise exception 'Message cannot be empty.';
  end if;

  select m.owner_id, ch.server_id, ch.read_only into v_owner, v_server_id, v_read_only
  from public.mascots m
  join public.channels ch on ch.id = p_channel_id
  where m.id = p_mascot_id;

  if v_owner is null or v_owner is distinct from auth.uid() then
    raise exception 'Not your mascot.';
  end if;

  if not exists (
    select 1 from public.server_members sm
    where sm.server_id = v_server_id and sm.user_id = auth.uid()
  ) then
    raise exception 'Mascot owner is not a member of this server.';
  end if;

  -- The mascot may only write where the owner could, and never into an
  -- announcement channel.
  if v_read_only
     or not public.channel_effective_permission(p_channel_id, 'post')
  then
    raise exception 'Owner cannot post in this channel.';
  end if;

  select g.id into v_grant
  from public.mascot_grants g
  where g.mascot_id = p_mascot_id and g.can_post and g.server_id = v_server_id
    and (g.channel_id is null or g.channel_id = p_channel_id)
  limit 1;

  if v_grant is null then
    raise exception 'Mascot has no posting grant for this channel.';
  end if;

  insert into public.mascot_messages (mascot_id, channel_id, body)
  values (p_mascot_id, p_channel_id, btrim(p_body))
  returning id into v_message_id;

  return v_message_id;
end;
$$;

-- Existing duplicates are identical scopes; retain the newest configuration.
delete from public.mascot_grants a using public.mascot_grants b
where a.mascot_id=b.mascot_id and a.server_id=b.server_id
  and a.channel_id is null and b.channel_id is null
  and (a.created_at,a.id) < (b.created_at,b.id);
create unique index if not exists mascot_grants_server_scope_uq
  on public.mascot_grants(mascot_id,server_id) where channel_id is null;
commit;

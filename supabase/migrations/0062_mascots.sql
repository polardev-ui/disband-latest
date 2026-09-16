-- 0062_mascots.sql
-- Mascots: generatively-unique, ownable companions.
--
-- Design notes
-- ------------
-- * A mascot is minted from a (species, seed) pair. The seed drives a
--   deterministic client-side art generator (src/lib/mascot.ts), so every
--   owner can re-roll a preview before paying and each minted mascot has
--   art that no other minted mascot shares. Uniqueness is enforced with a
--   unique index on the perceptual fingerprint, minted rows only.
-- * The $1 September promo and later regular price are decided in
--   src/lib/mascot.ts, not here. Card rows stage the payment exactly like
--   gifts: a pending row exists before checkout so a paid webhook always has
--   somewhere to land.
-- * Selling is a marketplace listing: seller sets a price, a buyer pays, a
--   webhook transfers ownership and credits the seller 90% to an in-app
--   balance (10% platform cut). No Stripe Connect in v1.
-- * "Control" is a scoped rules engine: grants tie a mascot to a server
--   (+optional channel) plus behaviour rules, and mascot_send_message
--   validates the owner's write permission before acting.

create table if not exists public.mascot_species (
  key text primary key,
  display_name text not null,
  tagline text not null,
  base_rarity_weights jsonb not null default '{}',
  trait_pool jsonb not null default '[]',
  created_at timestamptz not null default now()
);

insert into public.mascot_species (key, display_name, tagline, base_rarity_weights, trait_pool)
values
  ('spark', 'Spark', 'Electric, quick-witted. Crackles when excited.',
   '{"common": 55, "uncommon": 27, "rare": 11, "epic": 5, "legendary": 2}',
   '["split_ear","forked_tail","spike_fin","supernova_eyes","rim_bolts","collar_charm","mane","star_heart"]'),
  ('tether', 'Tether', 'Steadfast, quietly brilliant. Holds the line.',
   '{"common": 55, "uncommon": 27, "rare": 11, "epic": 5, "legendary": 2}',
   '["halo_ring","tassel_antenna","banded_tail","twin_knots","pendant","aurora_stripe","wrapped_collar","anchor_mark"]')
on conflict (key) do nothing;

create table if not exists public.mascots (
  id uuid primary key default gen_random_uuid(),
  species text not null references public.mascot_species(key) on delete restrict,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  seed text not null,
  fingerprint text not null,
  rarity text not null default 'common',
  traits jsonb not null default '[]',
  level int not null default 1,
  xp int not null default 0,
  listed_price_cents int,
  listed_at timestamptz,
  minted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint mascots_rarity_check check (rarity in ('common', 'uncommon', 'rare', 'epic', 'legendary')),
  constraint mascots_listed_price_check check (listed_price_cents is null or listed_price_cents > 0),
  unique (species, seed)
);

-- No two minted mascots may render to the same art. The couple-of-oneshot
-- collision that slips past the (species, seed) key is caught here.
create unique index if not exists mascots_fingerprint_uq
  on public.mascots (fingerprint);

-- Pending one-off purchases (the $1 mint). A row is inserted before Stripe
-- checkout so the webhook has a row to flip when the payment lands.
create table if not exists public.mascot_purchases (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  species text not null references public.mascot_species(key) on delete restrict,
  seed text not null,
  name text not null,
  fingerprint text not null,
  rarity text not null default 'common',
  traits jsonb not null default '[]',
  amount_cents int not null,
  stripe_session_id text,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'minted', 'refunded')),
  created_at timestamptz not null default now(),
  unique (species, seed)
);

-- Pending marketplace sales. Price is frozen into the row at payment time;
-- the webhook only transfers if it still matches the listing.
create table if not exists public.mascot_sales (
  id uuid primary key default gen_random_uuid(),
  mascot_id uuid not null references public.mascots(id) on delete restrict,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  amount_cents int not null,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'applied', 'failed')),
  stripe_session_id text,
  created_at timestamptz not null default now()
);

-- Channels a mascot is allowed to act in, plus its behaviour rules.
-- channel_id null = any channel the owner can write to.
create table if not exists public.mascot_grants (
  id uuid primary key default gen_random_uuid(),
  mascot_id uuid not null references public.mascots(id) on delete cascade,
  server_id uuid not null references public.servers(id) on delete restrict,
  channel_id uuid references public.channels(id) on delete cascade,
  can_post boolean not null default true,
  can_react boolean not null default true,
  rule jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (mascot_id, server_id, channel_id)
);

create table if not exists public.mascot_messages (
  id uuid primary key default gen_random_uuid(),
  mascot_id uuid not null references public.mascots(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  body text not null,
  reactions jsonb not null default '[]',
  created_at timestamptz not null default now()
);

-- In-app balance for sellers (90% of a sale, minus the platform cut).
create table if not exists public.account_credits (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance_cents int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_ledger (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  delta_cents int not null,
  reason text not null,
  mascot_id uuid,
  amount_cents int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.mascots enable row level security;
alter table public.mascot_purchases enable row level security;
alter table public.mascot_sales enable row level security;
alter table public.mascot_grants enable row level security;
alter table public.mascot_messages enable row level security;
alter table public.account_credits enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.mascot_species enable row level security;

-- Everyone signed-in can read the 2-species catalogue (harmless metadata).
create policy "mascot_species_readable" on public.mascot_species
  for select to authenticated using (true);

-- Owners see their own mascots; listed ones are visible to everyone for the
-- marketplace. Everything else (mint insert, transfer, listing writes) is
-- done through SECURITY DEFINER RPCs or the service role.
create policy "mascots_select_own" on public.mascots
  for select to authenticated using (owner_id = auth.uid());
create policy "mascots_select_listed" on public.mascots
  for select to authenticated using (listed_price_cents is not null);

create policy "mascot_purchases_select_own" on public.mascot_purchases
  for select to authenticated using (buyer_id = auth.uid());

create policy "mascot_sales_select_party" on public.mascot_sales
  for select to authenticated using (buyer_id = auth.uid() or seller_id = auth.uid());

create policy "mascot_grants_select_owner" on public.mascot_grants
  for select to authenticated
  using (exists (select 1 from public.mascots m where m.id = mascot_id and m.owner_id = auth.uid()));
create policy "mascot_messages_select_member" on public.mascot_messages
  for select to authenticated
  using (exists (
    select 1 from public.mascots m
    where m.id = mascot_id and m.owner_id = auth.uid()
  ));

create policy "account_credits_select_own" on public.account_credits
  for select to authenticated using (user_id = auth.uid());

create policy "credit_ledger_select_own" on public.credit_ledger
  for select to authenticated using (user_id = auth.uid());

-- 1) + 2) Marketplace listing and unlisting by the owner.
create or replace function public.list_mascot(
  p_mascot_id uuid,
  p_price_cents integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_price_cents is null or p_price_cents <= 0 then
    raise exception 'Price must be a positive whole number of cents.';
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
  update public.mascots
    set listed_price_cents = null, listed_at = null
    where id = p_mascot_id and owner_id = auth.uid();
  return found;
end;
$$;

-- 3) Rename an owned mascot.
create or replace function public.rename_mascot(p_mascot_id uuid, p_name text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_name is null or length(btrim(p_name)) = 0 or length(btrim(p_name)) > 32 then
    raise exception 'Name must be between 1 and 32 characters.';
  end if;
  update public.mascots
    set name = btrim(p_name)
    where id = p_mascot_id and owner_id = auth.uid();
  return found;
end;
$$;

-- 4) "Perfecting": training earns XP and levels.
create or replace function public.train_mascot(p_mascot_id uuid, p_amount integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_amount is null or p_amount <= 0 or p_amount > 100 then
    raise exception 'Training amount out of range.';
  end if;
  update public.mascots
    set xp = xp + p_amount,
        level = greatest(1, floor((xp + p_amount) / 100)::int + 1)
    where id = p_mascot_id and owner_id = auth.uid();
  return found;
end;
$$;

-- 5) Grants: attach a mascot to a server/channel with behaviour rules.
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
  delete from public.mascot_grants g
  using public.mascots m
  where g.id = p_grant_id and g.mascot_id = m.id and m.owner_id = auth.uid();
  return found;
end;
$$;

-- 6) Let the mascot speak, gated on the owner's own write permission. The
--    owner's effective "post" ability comes from channel_effective_permission
--    (0057), which already ORs role defaults, per-channel overrides and the
--    owner/admin bypass.
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

-- 7) Sellers get 90% of each sale on an in-app balance (no Connect in v1).
--    Service-role only: called from the webhook. Integer-add with an
--    insert-on-missing so it is safe under concurrent sales.
create or replace function public.credit_user(
  p_user uuid,
  p_delta integer,
  p_reason text,
  p_mascot_id uuid default null,
  p_amount integer default 0
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_delta = 0 then return; end if;
  insert into public.account_credits (user_id, balance_cents, updated_at)
  values (p_user, p_delta, now())
  on conflict (user_id)
  do update set balance_cents = public.account_credits.balance_cents + excluded.balance_cents,
                updated_at = now();

  insert into public.credit_ledger (user_id, delta_cents, reason, mascot_id, amount_cents)
  values (p_user, p_delta, p_reason, p_mascot_id, p_amount);
end;
$$;

grant usage on schema public to authenticated;
grant execute on function public.list_mascot(uuid, integer) to authenticated;
grant execute on function public.unlist_mascot(uuid) to authenticated;
grant execute on function public.rename_mascot(uuid, text) to authenticated;
grant execute on function public.train_mascot(uuid, integer) to authenticated;
grant execute on function public.add_mascot_grant(uuid, uuid, uuid, boolean, boolean, jsonb) to authenticated;
grant execute on function public.remove_mascot_grant(uuid) to authenticated;
grant execute on function public.mascot_send_message(uuid, uuid, text) to authenticated;

revoke execute on function public.credit_user(uuid, integer, text, uuid, integer) from anon, authenticated;
grant execute on function public.credit_user(uuid, integer, text, uuid, integer) to service_role;
-- Apple in-app purchases: the ledger and the consumable path.
--
-- Migration 0045 added `provider` and `apple_original_transaction_id` to
-- `subscriptions` and referred to "the Apple verify endpoint" that would
-- write them. That endpoint was never built, so nothing has ever set those
-- columns. This migration adds the two things it needs.

-- 1. The transaction ledger.
--
-- Apple redelivers server notifications, StoreKit replays unfinished
-- transactions on every launch, and a user can hit "restore" whenever they
-- like — so the same transaction arrives many times and must be applied
-- once. The primary key is Apple's own transaction id, which makes that
-- exactly-once by construction rather than by careful code.
create table if not exists public.apple_transactions (
  transaction_id text primary key,
  original_transaction_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id text not null,
  -- 'auto_renewable' | 'consumable'. What the transaction bought decides
  -- which entitlement it grants, and it comes from Apple, not the client.
  kind text not null,
  purchased_at timestamptz not null,
  expires_at timestamptz,
  revoked_at timestamptz,
  -- The environment Apple says this came from. A Sandbox transaction must
  -- never grant a paid entitlement in production, and the only way to know
  -- is to record what Apple told us.
  environment text not null default 'Production',
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_apple_transactions_user
  on public.apple_transactions (user_id);
create index if not exists idx_apple_transactions_original
  on public.apple_transactions (original_transaction_id);

alter table public.apple_transactions enable row level security;

-- Readable by the owner so the app can show its own purchase history.
-- Every write is the service role's: a client that could write here could
-- grant itself Aero.
drop policy if exists "own apple transactions" on public.apple_transactions;
create policy "own apple transactions" on public.apple_transactions
  for select using (auth.uid() = user_id);

-- 2. Catalysts bought through the App Store.
--
-- `server_catalysts` keyed idempotency on (stripe_session_id, session_seq).
-- An Apple purchase has no Stripe session, so it needs its own handle, and
-- a quantity > 1 needs the same per-unit sequence trick migration 0083
-- introduced for Stripe.
alter table public.server_catalysts
  add column if not exists apple_transaction_id text;

create unique index if not exists idx_server_catalysts_apple_unit
  on public.server_catalysts (apple_transaction_id, session_seq)
  where apple_transaction_id is not null;

-- `source` already defaults to 'grant' and takes 'purchase'; Apple units are
-- purchases too, distinguished by which id column is populated.

-- 3. Which App Store product grants what.
--
-- Kept in the database rather than hardcoded so a price or SKU change is a
-- row, not a release of four clients. The ids must match App Store Connect
-- exactly.
create table if not exists public.apple_products (
  product_id text primary key,
  -- 'aero' for the subscription, 'catalyst' for the consumable.
  grants text not null check (grants in ('aero', 'catalyst')),
  -- How many units a single purchase grants. Always 1 for the subscription.
  quantity integer not null default 1 check (quantity between 1 and 99),
  active boolean not null default true
);

alter table public.apple_products enable row level security;

-- The catalogue is public: the app needs to know which ids to ask StoreKit
-- for before anyone has signed in.
drop policy if exists "apple products are public" on public.apple_products;
create policy "apple products are public" on public.apple_products
  for select using (true);

-- Placeholders matching the ids the app will ask StoreKit for. Adjust them
-- to whatever App Store Connect ends up using — StoreKit returns nothing at
-- all for an id that does not exist there, so these two must match.
insert into public.apple_products (product_id, grants, quantity) values
  ('dev.disband.aero.monthly', 'aero', 1),
  ('dev.disband.catalyst.single', 'catalyst', 1)
on conflict (product_id) do nothing;

-- Apple (StoreKit) in-app subscriptions.
--
-- Adds a `provider` column so the table can distinguish Stripe-originated
-- subscriptions from Apple App Store ones (the row still shares the single
-- unique `user_id`, matching the existing Stripe-shaped model). Also records
-- the Apple original transaction id, which is the stable handle Apple uses to
-- identify a subscription across renewals and across the user's devices.

alter table public.subscriptions
  add column if not exists provider text
    check (provider in ('stripe', 'apple')),

  add column if not exists apple_original_transaction_id text;

create unique index if not exists idx_subscriptions_apple_original_txn
  on public.subscriptions (apple_original_transaction_id)
  where apple_original_transaction_id is not null;

-- The web / iOS clients both read this column but never write it directly; the
-- service role (via the Stripe webhook and the Apple verify endpoint) owns all
-- writes. To keep the check constraint simple and the resolved plan correct,
-- "apple" rows use the same `plan` / `status` vocabulary as Stripe rows.

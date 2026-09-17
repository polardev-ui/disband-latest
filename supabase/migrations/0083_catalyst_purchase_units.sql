-- 0083_catalyst_purchase_units.sql
-- Fixes a revenue bug: buying more than one catalyst in a single checkout
-- never delivered anything.
--
-- 0081 added `unique (stripe_session_id) where stripe_session_id is not null`
-- to make fulfilment idempotent across Stripe's redeliveries. But a catalyst
-- is one ROW per unit, so a quantity-6 order inserts six rows that all carry
-- the same session id — which that index forbids. The whole INSERT failed,
-- the webhook threw, the route answered 500, Stripe retried until it gave up,
-- and the buyer was charged and received nothing. Quantity 1 worked, which is
-- why this went unnoticed.
--
-- The unit's ordinal within its order is what makes a purchased row unique, so
-- the index moves to (stripe_session_id, session_seq). Redelivery still
-- collides on every unit, so `on conflict do nothing` stays exactly-once.
--
-- The index is deliberately NOT partial. A partial index cannot serve as an
-- `on conflict` arbiter unless the statement repeats its predicate, and the
-- predicate buys nothing here: nulls are distinct in a unique index, so the
-- monthly-grant rows (null session id, seq 0) never collide with each other.

alter table public.server_catalysts
  add column if not exists session_seq integer not null default 0;

drop index if exists public.server_catalysts_session_uidx;

create unique index if not exists server_catalysts_session_unit_uidx
  on public.server_catalysts (stripe_session_id, session_seq);

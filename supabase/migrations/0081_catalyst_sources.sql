-- 0081_catalyst_sources.sql
-- Purchased catalysts must fulfill exactly once: Stripe redelivers
-- `checkout.session.completed` until it sees a 2xx, so the webhook inserts
-- with the session id and `on conflict do nothing`. Monthly-grant rows keep
-- a null session id (nulls never collide in the partial unique index).

alter table public.server_catalysts
  add column if not exists source text not null default 'grant',
  add column if not exists stripe_session_id text;

create unique index if not exists server_catalysts_session_uidx
  on public.server_catalysts (stripe_session_id)
  where stripe_session_id is not null;

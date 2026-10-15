-- PostgREST's ON CONFLICT (apple_transaction_id, session_seq) cannot infer
-- 0106's partial unique index without repeating its WHERE predicate. That
-- caused Catalyst delivery to fail even though the purchase was recorded.
-- NULL transaction ids remain distinct in a normal unique index, so grants
-- and Stripe purchases still coexist; Apple deliveries stay idempotent.
drop index if exists public.idx_server_catalysts_apple_unit;
create unique index idx_server_catalysts_apple_unit
  on public.server_catalysts (apple_transaction_id, session_seq);

-- One-off: fix the catalyst purchase path and fulfil the order it dropped.
-- Run as a single script in the Supabase SQL editor (Dashboard -> SQL Editor).
-- Safe to run twice: every statement is idempotent.
--
-- Context: esp (9970924c-9497-465e-9fbf-8699f3dc3ed0) paid $10.68 on
-- 2026-09-17T21:23Z for 6 catalysts on "house of ogu's"
-- (1a797031-0f29-45b1-93ac-58bf25b18ad6) and received none, because six rows
-- carrying one session id collided with the unique index added in 0081.
-- Stripe session: cs_live_b1BRuRlZj3cSifjpSLMVcQnMw6NwqpgDR5CXlFAFtThdDEObIwTYaEJSad

begin;

-- 1. Schema fix (identical to supabase/migrations/0083_catalyst_purchase_units.sql).
alter table public.server_catalysts
  add column if not exists session_seq integer not null default 0;

drop index if exists public.server_catalysts_session_uidx;

create unique index if not exists server_catalysts_session_unit_uidx
  on public.server_catalysts (stripe_session_id, session_seq);

-- 2a. Absorb any 'purchase' rows for this buyer/server that have no session id
--     (e.g. a manual grant made before this script ran), so they count as
--     units of this order rather than as extra catalysts on top of it.
with orphans as (
  select id, (row_number() over (order by created_at)) - 1 as rn
  from public.server_catalysts
  where user_id   = '9970924c-9497-465e-9fbf-8699f3dc3ed0'::uuid
    and server_id = '1a797031-0f29-45b1-93ac-58bf25b18ad6'::uuid
    and source    = 'purchase'
    and stripe_session_id is null
)
update public.server_catalysts c
   set stripe_session_id = 'cs_live_b1BRuRlZj3cSifjpSLMVcQnMw6NwqpgDR5CXlFAFtThdDEObIwTYaEJSad',
       session_seq       = o.rn
  from orphans o
 where c.id = o.id
   and o.rn < 6;

-- 2b. Top the order up to its 6 paid units. Converges to exactly 6 from any
--     starting state, so the script is safe to run more than once.
insert into public.server_catalysts (server_id, user_id, source, stripe_session_id, session_seq)
select '1a797031-0f29-45b1-93ac-58bf25b18ad6'::uuid,
       '9970924c-9497-465e-9fbf-8699f3dc3ed0'::uuid,
       'purchase',
       'cs_live_b1BRuRlZj3cSifjpSLMVcQnMw6NwqpgDR5CXlFAFtThdDEObIwTYaEJSad',
       seq
from generate_series(0, 5) as seq
on conflict (stripe_session_id, session_seq) do nothing;

commit;

-- 3. Verify: expect 6 rows, seq 0..5, and the server at Level 3.
select count(*) as catalysts,
       array_agg(session_seq order by session_seq) as units
from public.server_catalysts
where stripe_session_id
    = 'cs_live_b1BRuRlZj3cSifjpSLMVcQnMw6NwqpgDR5CXlFAFtThdDEObIwTYaEJSad';

select s.name,
       count(c.id) as catalysts,
       case when count(c.id) >= 6 then 'Level 3'
            when count(c.id) >= 3 then 'Level 2'
            when count(c.id) >= 1 then 'Level 1'
            else 'No level' end as level
from public.servers s
left join public.server_catalysts c on c.server_id = s.id
where s.id = '1a797031-0f29-45b1-93ac-58bf25b18ad6'
group by s.name;

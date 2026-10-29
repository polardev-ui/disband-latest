-- ---------------------------------------------------------------------------
-- 0180: faster reads under row-level security, and DM recency in one call.
--
-- 1. Almost every table has a restrictive policy calling
--    auth_aal_allows_access(), and most policies compare against auth.uid().
--    Written bare, Postgres runs them once per row: listing the latest
--    activity of one account's 219 DMs ran the MFA check about 34,000 times
--    and took ~970 ms, against ~20 ms without it. Wrapped as (select ...),
--    each runs once per query. These helpers take no arguments and read only
--    the request's JWT or the caller's own rows, so every policy means
--    exactly what it did. This is Supabase's own guidance (lint 0003,
--    auth_rls_initplan), which flags 106 policies here.
--
-- 2. get_dm_thread_activity(): when each of your conversations last had a
--    message, one row per conversation. The app used to read every DM
--    message's timestamp to work this out.
-- ---------------------------------------------------------------------------

do $$
declare
  p record;
  h text;
  pattern text;
  new_qual text;
  new_check text;
  changed int := 0;
  helpers text[] := array[
    'auth.uid()',
    'auth.jwt()',
    'auth.role()',
    'auth_aal_allows_access()',
    'is_platform_banned()',
    'official_account_id()'
  ];
begin
  -- Each ALTER POLICY briefly locks its table. Give up rather than queue
  -- behind a long-running query and stall the app.
  perform set_config('lock_timeout', '5s', true);

  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
  loop
    new_qual := p.qual;
    new_check := p.with_check;
    foreach h in array helpers loop
      -- Not part of a longer name, and not already wrapped (Postgres prints
      -- a wrapped call as "SELECT auth.uid() AS uid").
      pattern := '(?<![[:alnum:]_.])(?<!SELECT )' || regexp_replace(h, '([.()])', '\\\1', 'g');
      if new_qual is not null then
        new_qual := regexp_replace(new_qual, pattern, '(select ' || h || ')', 'g');
      end if;
      if new_check is not null then
        new_check := regexp_replace(new_check, pattern, '(select ' || h || ')', 'g');
      end if;
    end loop;

    if new_qual is distinct from p.qual or new_check is distinct from p.with_check then
      execute format(
        'alter policy %I on %I.%I%s%s',
        p.policyname, p.schemaname, p.tablename,
        case when p.qual is not null then ' using (' || new_qual || ')' else '' end,
        case when p.with_check is not null then ' with check (' || new_check || ')' else '' end
      );
      changed := changed + 1;
    end if;
  end loop;

  raise notice 'Wrapped auth helpers in % policies', changed;
end;
$$;

create or replace function public.get_dm_thread_activity()
returns table (thread_id uuid, last_message_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select t.id,
         (select m.created_at
            from public.dm_messages m
           where m.thread_id = t.id
           order by m.created_at desc
           limit 1)
  from public.dm_threads t
  where (select auth.uid()) in (t.user_a, t.user_b)
    and (select public.auth_aal_allows_access());
$$;
revoke all on function public.get_dm_thread_activity() from public, anon;
grant execute on function public.get_dm_thread_activity() to authenticated;

-- Conversations are looked up by either participant; user_b had no index of
-- its own and was answered by scanning the (user_a, user_b) index.
create index if not exists dm_threads_user_b_idx on public.dm_threads (user_b);

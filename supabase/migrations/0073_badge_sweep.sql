-- 0073_badge_sweep.sql
-- Make automatic badges actually automatic.
--
-- refresh_user_badges() has always held the whole auto-award engine — bot
-- developer, founder, anniversary, bug hunter, voice minutes and the rest —
-- but the only thing that ever called it was the client, for the person
-- signing in. So a badge could only be earned by signing in again, nothing was
-- ever awarded while the app was open, and anyone who stayed signed in (or
-- stopped signing in) never earned anything at all.
--
-- The first sweep after this landed awarded 546 badges that people had already
-- earned and never received.
--
-- One pass over a user costs about 0.7 ms, so the whole platform is a second
-- or two of work.

create extension if not exists pg_cron;

-- Which accounts have been looked at, and when.
create table if not exists public.badge_refresh_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  refreshed_at timestamptz not null default now()
);

alter table public.badge_refresh_state enable row level security;
revoke all on public.badge_refresh_state from anon, authenticated;

/**
 * Refresh the badges of the accounts least recently looked at.
 *
 * Bounded rather than "every user in one pass" so the job's cost stays flat as
 * the platform grows: whatever the size, each run does p_limit accounts and
 * the marker table carries the position forward.
 */
create or replace function public.refresh_badges_sweep(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  u uuid;
  n integer := 0;
begin
  for u in
    select p.id
    from public.profiles p
    left join public.badge_refresh_state s on s.user_id = p.id
    order by s.refreshed_at asc nulls first
    limit greatest(1, p_limit)
  loop
    perform public.refresh_user_badges(u);
    insert into public.badge_refresh_state (user_id, refreshed_at)
    values (u, now())
    on conflict (user_id) do update set refreshed_at = now();
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.refresh_badges_sweep(integer) from public, anon, authenticated;
grant execute on function public.refresh_badges_sweep(integer) to service_role;

-- Every five minutes, 500 accounts. Applied out of band because cron.schedule
-- is not idempotent:
--
--   select cron.unschedule(jobid) from cron.job where jobname = 'badge-sweep';
--   select cron.schedule('badge-sweep', '*/5 * * * *',
--                        $job$select public.refresh_badges_sweep(500);$job$);

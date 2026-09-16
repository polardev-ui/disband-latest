-- 0075_voice_presence_heartbeat.sql
-- Make "who is in this voice channel" mean "who is in it now".
--
-- voice_presence had only joined_at, and a row was deleted only when a client
-- left politely. A closed tab, a refresh, a crash or a lost connection left the
-- row behind forever — the oldest on the platform had been sitting there for
-- 678 hours, and the sidebar was dutifully counting a 213-hour call. It also
-- meant refreshing the page showed you still inside the channel you had just
-- left, because as far as the table was concerned you were.
--
-- A row now has to prove it is alive. Clients touch last_seen_at while they
-- are connected; anything that stops touching it stops counting within ninety
-- seconds, whatever happened to the browser.

alter table public.voice_presence
  add column if not exists last_seen_at timestamptz not null default now();

update public.voice_presence set last_seen_at = joined_at;

create index if not exists voice_presence_last_seen_idx
  on public.voice_presence (last_seen_at);

-- Filtering lives here, not in each client: the cutoff has to be measured
-- against the database's clock, or a machine with a skewed clock sees ghosts
-- that nobody else does.
create or replace view public.voice_presence_live
with (security_invoker = true) as
select channel_id, user_id, joined_at, muted, deafened, last_seen_at
from public.voice_presence
where last_seen_at > now() - interval '90 seconds';

grant select on public.voice_presence_live to authenticated;

-- Takes the channel so a stale client cannot keep a row alive in a channel it
-- has already left, and writes nothing if the row is gone.
create or replace function public.touch_voice_presence(p_channel uuid)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.voice_presence
     set last_seen_at = now()
   where channel_id = p_channel and user_id = auth.uid();
$$;

revoke all on function public.touch_voice_presence(uuid) from public, anon;
grant execute on function public.touch_voice_presence(uuid) to authenticated;

create or replace function public.prune_voice_presence()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  delete from public.voice_presence
   where last_seen_at < now() - interval '2 minutes';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.prune_voice_presence() from public, anon, authenticated;
grant execute on function public.prune_voice_presence() to service_role;

-- Scheduled out of band, because cron.schedule is not idempotent:
--
--   select cron.unschedule(jobid) from cron.job where jobname='voice-presence-prune';
--   select cron.schedule('voice-presence-prune', '* * * * *',
--                        $job$select public.prune_voice_presence();$job$);

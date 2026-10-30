-- ---------------------------------------------------------------------------
-- 0186: spaces can be reported, and Sentinel checks spaces with AI.
--
--   1. message_reports accepts a whole space as a target (target_type
--      'server', surface 'server', table 'servers'). Sentinel files its own
--      findings from the routine space check here too, with no reporter.
--   2. servers.ai_checked_at records when Sentinel last read a space, so the
--      routine check works through every space in turn.
--   3. sentinel_suspend_server lets Sentinel close a space it is confident
--      is trading child sexual abuse material. A person always confirms: the
--      report stays in the queue, and unsuspending is one click.
-- ---------------------------------------------------------------------------

alter table public.message_reports alter column reporter_id drop not null;

alter table public.message_reports drop constraint if exists message_reports_target_type_check;
alter table public.message_reports add constraint message_reports_target_type_check
  check (target_type in ('message', 'profile', 'server'));

alter table public.message_reports drop constraint if exists message_reports_target_surface_check;
alter table public.message_reports add constraint message_reports_target_surface_check
  check (target_surface in ('channel', 'dm', 'group', 'profile', 'server'));

alter table public.message_reports drop constraint if exists message_reports_target_table_check;
alter table public.message_reports add constraint message_reports_target_table_check
  check (target_table in ('messages', 'dm_messages', 'group_messages', 'profiles', 'servers'));

alter table public.servers add column if not exists ai_checked_at timestamptz;
create index if not exists servers_ai_checked_idx on public.servers (ai_checked_at nulls first);

create or replace function public.sentinel_suspend_server(p_server uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.servers
     set suspended_at = now(),
         suspended_reason = left(coalesce(nullif(trim(p_reason), ''), 'Disband Safety'), 500),
         suspended_by = null,
         discoverable = false
   where id = p_server and suspended_at is null;
  return found;
end;
$$;

revoke all on function public.sentinel_suspend_server(uuid, text) from public, anon, authenticated;
grant execute on function public.sentinel_suspend_server(uuid, text) to service_role;

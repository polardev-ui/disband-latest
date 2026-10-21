-- 0143: Disband Partner space badge
--
-- Partner is a staff-granted badge, like Verified. Space owners can edit their
-- own row (servers_update_owner) but must not be able to grant themselves
-- either badge, so the guard blocks authenticated callers. The platform-owner
-- API writes through the service role, which passes the guard.

alter table public.servers add column if not exists partner boolean not null default false;

create or replace function public.guard_server_partner() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() = 'authenticated' then
    if (tg_op = 'INSERT' and new.partner) or
       (tg_op = 'UPDATE' and new.partner is distinct from old.partner) then
      raise exception 'Only Disband staff can mark servers as partners';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_servers_guard_partner on public.servers;
create trigger trg_servers_guard_partner
  before insert or update of partner on public.servers
  for each row execute function public.guard_server_partner();

-- Return types are changing, so the functions have to be recreated. Keep the
-- live definitions (vanity-code lookup, rate limiting and ordering) intact.
drop function if exists public.list_discoverable_servers();
drop function if exists public.get_server_by_invite(text);

create or replace function public.list_discoverable_servers()
returns table (
  id uuid, name text, icon_url text, banner_url text, description text,
  owner_id uuid, owner_name text, member_count bigint, created_at timestamptz,
  verified boolean, partner boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    s.id, s.name, s.icon_url, s.banner_url, s.description,
    s.owner_id,
    coalesce(p.display_name, p.username, 'Unknown') as owner_name,
    (select count(*) from public.server_members sm where sm.server_id = s.id) as member_count,
    s.created_at,
    s.verified,
    s.partner
  from public.servers s
  join public.profiles p on p.id = s.owner_id
  where s.discoverable = true
  order by member_count desc, s.created_at asc;
$$;

revoke all on function public.list_discoverable_servers() from public, anon, authenticated;
grant execute on function public.list_discoverable_servers() to authenticated, service_role;

create or replace function public.get_server_by_invite(p_code text)
returns table (
  id uuid,
  name text,
  description text,
  icon_url text,
  banner_url text,
  invite_code text,
  member_count bigint,
  verified boolean,
  partner boolean
)
language plpgsql
security definer
set search_path = public
-- VOLATILE for the platform_rate_limit write; see 0082.
volatile
as $$
begin
  perform public.platform_rate_limit('invite:' || coalesce(auth.uid()::text, 'anon'), 15, 60);
  return query
  select s.id, s.name, s.description, s.icon_url, s.banner_url, s.invite_code,
    (select count(*) from public.server_members sm where sm.server_id = s.id),
    s.verified,
    s.partner
  from public.servers s
  where s.invite_code = p_code
     or (s.vanity_code is not null and lower(s.vanity_code) = lower(p_code));
end;
$$;

revoke all on function public.get_server_by_invite(text) from public, anon, authenticated;
grant execute on function public.get_server_by_invite(text) to authenticated, service_role;

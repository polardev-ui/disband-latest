-- ---------------------------------------------------------------------------
-- 0056: Verified server badge ("This server is officially verified by Disband")
--
-- Adds servers.verified, exposes it on the discovery and invite-preview RPCs,
-- and restricts who can flip it.
-- ---------------------------------------------------------------------------

alter table public.servers add column if not exists verified boolean not null default false;

-- Owners can edit every other servers column (servers_update_owner in 0002),
-- but verification is staff-only. A column-level REVOKE would be a no-op
-- because authenticated already holds table-level UPDATE (needed for owners
-- editing servers), so guard inside a before-trigger instead: the app role is
-- blocked from ever flipping verified. Superuser/service-role SQL (migrations,
-- admin) passes because auth.role() is never 'authenticated' there.
create or replace function public.guard_server_verification() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() = 'authenticated' then
    if (tg_op = 'INSERT' and new.verified) or
       (tg_op = 'UPDATE' and new.verified is distinct from old.verified) then
      raise exception 'Only Disband staff can verify servers';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_servers_guard_verification on public.servers;
create trigger trg_servers_guard_verification
  before insert or update of verified on public.servers
  for each row execute function public.guard_server_verification();

-- Changing the OUT parameters of a function isn't allowed under
-- CREATE OR REPLACE, so drop before recreating (the drop resets grants; the
-- grant lines below restore them).
drop function if exists public.list_discoverable_servers();
drop function if exists public.get_server_by_invite(text);

-- Discovery results now carry the flag (DiscoverPanel).
create or replace function public.list_discoverable_servers()
returns table (
  id uuid, name text, icon_url text, banner_url text, description text,
  owner_id uuid, owner_name text, member_count bigint, created_at timestamptz,
  verified boolean
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
    s.verified
  from public.servers s
  join public.profiles p on p.id = s.owner_id
  where s.discoverable = true
  order by member_count desc, s.created_at asc
  limit 40;
$$;

grant execute on function public.list_discoverable_servers() to authenticated;

-- Invite preview now carries the flag too (ServerInviteCard via /api/invites/[code]).
create or replace function public.get_server_by_invite(p_code text)
returns table (
  id uuid,
  name text,
  description text,
  icon_url text,
  banner_url text,
  invite_code text,
  member_count bigint,
  verified boolean
)
language plpgsql
security definer
set search_path = public
-- VOLATILE, not STABLE: platform_rate_limit below writes a row, and PostgREST
-- picks the transaction mode from a function's volatility rather than the HTTP
-- method. Declared STABLE this runs read-only and the rate-limit insert fails
-- with "cannot execute INSERT in a read-only transaction", which takes every
-- invite preview down.
volatile
as $$
begin
  perform public.platform_rate_limit('invite:' || coalesce(auth.uid()::text, 'anon'), 15, 60);
  return query
  select s.id, s.name, s.description, s.icon_url, s.banner_url, s.invite_code,
    (select count(*) from public.server_members sm where sm.server_id = s.id),
    s.verified
  from public.servers s
  where s.invite_code = p_code;
end;
$$;

revoke execute on function public.get_server_by_invite(text) from anon;
grant execute on function public.get_server_by_invite(text) to authenticated, service_role;
-- ---------------------------------------------------------------------------
-- 0096: Discovery returns every discoverable server
--
-- list_discoverable_servers capped results at 40, so once the discoverable
-- set grows past that, newer/smaller spaces disappear from Discover. All
-- clients (DiscoverPanel on web/desktop, iOS DatabaseService) fetch the full
-- set and do search/sort locally, so drop the cap and return every
-- discoverable server, most members first.
-- ---------------------------------------------------------------------------

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
  order by member_count desc, s.created_at asc;
$$;

grant execute on function public.list_discoverable_servers() to authenticated;
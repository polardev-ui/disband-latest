-- 0059_get_server_members.sql
-- Return a server's members with each member's profile row embedded, all in a
-- single round trip. Clients used to load the member ids and then fetch their
-- profiles via one giant `profiles?select=*&id=in.(...)` filter; on big
-- servers (hundreds of members) that URL alone exceeded the proxy limit and
-- the whole request came back 400 — emptying the member list on exactly the
-- servers that need it. Passing a single server_id keeps the URL small no
-- matter how large the server is.

create or replace function public.get_server_members(p_server_id uuid)
returns table (
  server_id uuid,
  user_id uuid,
  role text,
  joined_at timestamptz,
  role_id uuid,
  profile jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    m.server_id,
    m.user_id,
    m.role,
    m.joined_at,
    m.role_id,
    to_jsonb(p) as profile
  from public.server_members m
  left join public.profiles p on p.id = m.user_id
  where m.server_id = p_server_id
    and public.is_server_member(p_server_id)
  order by m.joined_at;
$$;

grant execute on function public.get_server_members(uuid) to authenticated;
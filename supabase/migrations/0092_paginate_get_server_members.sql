-- 0092_paginate_get_server_members.sql
-- PostgREST caps RPC responses at db-max-rows (default 1,000), so servers
-- with more than 1,000 members were silently truncated. Add pagination
-- parameters to get_server_members so callers can iterate past the cap.

create or replace function public.get_server_members(
  p_server_id uuid,
  p_page int default 1,
  p_page_size int default 1000
)
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
  order by m.joined_at
  limit p_page_size
  offset (p_page - 1) * p_page_size;
$$;

grant execute on function public.get_server_members(uuid, int, int) to authenticated;

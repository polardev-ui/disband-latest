-- 0160_member_list_stability.sql
-- Make paging through a large roster deterministic.
--
-- get_server_members ordered only by joined_at. Ties are not unique in real
-- data (the official server already has three), so OFFSET paging could show
-- the same member twice and skip another between pages. Add a stable
-- tiebreaker and a matching index for the (server_id, joined_at, user_id)
-- scan the RPC uses.
--
-- The iOS client also pages this RPC now; it previously asked once and got
-- PostgREST's 1,000-row cap, which silently omitted later joiners.

create index if not exists server_members_server_joined_idx
  on public.server_members (server_id, joined_at, user_id);

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
  order by m.joined_at, m.user_id
  limit least(greatest(coalesce(p_page_size, 1000), 1), 1000)
  offset (greatest(coalesce(p_page, 1), 1) - 1) *
    least(greatest(coalesce(p_page_size, 1000), 1), 1000);
$$;

grant execute on function public.get_server_members(uuid, int, int) to authenticated;

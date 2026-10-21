-- 0134_member_list_window.sql
-- A member list that scales to spaces with thousands of members.
--
-- The client used to page through get_server_members (ordered by join date)
-- and derive the Online/Offline headers from whatever it had loaded, so a
-- 5,000-member space showed "Offline — 500". Now:
--
--   * Online members come from live presence (profiles.status goes stale when
--     a tab closes, so it can't be trusted for this). The client asks for just
--     those people with get_server_members_by_ids.
--   * Everyone else is listed alphabetically and fetched by offset with
--     get_server_offline_members, a page at a time as the list scrolls, with
--     the online ids excluded so the two sections never overlap.
--   * The exact total comes from get_server_member_counts (already present).
--
-- Both functions return the member's role ids inline, so a page is complete
-- on its own and doesn't depend on a separate member_roles fetch.

create or replace function public.get_server_members_by_ids(p_server_id uuid, p_user_ids uuid[])
returns table(server_id uuid, user_id uuid, role text, joined_at timestamptz, role_id uuid, role_ids uuid[], profile jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select m.server_id, m.user_id, m.role, m.joined_at, m.role_id,
         array(select mr.role_id from public.member_roles mr where mr.server_id = m.server_id and mr.user_id = m.user_id),
         to_jsonb(p)
  from public.server_members m
  left join public.profiles p on p.id = m.user_id
  where m.server_id = p_server_id
    and public.is_server_member(p_server_id)
    and m.user_id = any(coalesce(p_user_ids, '{}'::uuid[]))
  limit 1000;
$$;

create or replace function public.get_server_offline_members(
  p_server_id uuid,
  p_exclude uuid[],
  p_offset integer,
  p_limit integer
)
returns table(server_id uuid, user_id uuid, role text, joined_at timestamptz, role_id uuid, role_ids uuid[], profile jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select m.server_id, m.user_id, m.role, m.joined_at, m.role_id,
         array(select mr.role_id from public.member_roles mr where mr.server_id = m.server_id and mr.user_id = m.user_id),
         to_jsonb(p)
  from public.server_members m
  left join public.profiles p on p.id = m.user_id
  where m.server_id = p_server_id
    and public.is_server_member(p_server_id)
    and not (m.user_id = any(coalesce(p_exclude, '{}'::uuid[])))
  order by lower(coalesce(nullif(p.display_name, ''), p.username, '')), m.user_id
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

revoke all on function public.get_server_members_by_ids(uuid, uuid[]) from public, anon;
revoke all on function public.get_server_offline_members(uuid, uuid[], integer, integer) from public, anon;
grant execute on function public.get_server_members_by_ids(uuid, uuid[]) to authenticated;
grant execute on function public.get_server_offline_members(uuid, uuid[], integer, integer) to authenticated;

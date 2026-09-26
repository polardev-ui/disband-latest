-- ---------------------------------------------------------------------------
-- 0103: Server member counts for hover tooltips
--
-- The server rail tooltip shows "N members · M online". Loading full member
-- lists on every hover would be absurd on large servers, so this returns just
-- the two numbers in one cheap indexed query.
--
-- Membership gate: only members of the server may see its counts (mirrors
-- get_server_members, which requires membership server-side).
--
-- "online" counts stored profiles.status in (online, idle, dnd) — the same
-- bucketing the member list uses. It can lag realtime presence by a little
-- (a crashed client stays "online" until its status row updates), which is
-- fine for a tooltip but must never be treated as an authoritative
-- presence source.
-- ---------------------------------------------------------------------------

create or replace function public.get_server_member_counts(p_server_id uuid)
returns table (total bigint, online bigint)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not exists (
    select 1 from public.server_members m
    where m.server_id = p_server_id and m.user_id = auth.uid()
  ) then
    raise exception 'Not a member of this server';
  end if;

  return query
    select
      count(*)::bigint,
      count(*) filter (
        where coalesce(p.status, 'offline') in ('online', 'idle', 'dnd')
      )::bigint
    from public.server_members m
    left join public.profiles p on p.id = m.user_id
    where m.server_id = p_server_id;
end;
$$;

grant execute on function public.get_server_member_counts(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 0190: channel member list, set-based.
--
-- 0189 called channel_member_can_view() once per member, about 6 seconds
-- for the 13,500-member official space. channel_viewers() works out the
-- roles that may view the channel once, then filters every member in one
-- pass. Same rules: owner/admin, manage_channels, a channel with no
-- overrides, or any assigned role (or @everyone) not denied view.
-- ---------------------------------------------------------------------------

create or replace function public.channel_viewers(p_channel_id uuid)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with c as (
    select ch.id, ch.server_id, s.owner_id
    from public.channels ch join public.servers s on s.id = ch.server_id
    where ch.id = p_channel_id
  ),
  open as (
    select not exists (select 1 from public.channel_permissions cp where cp.channel_id = p_channel_id) as o
  ),
  manage as (
    select sr.id from public.server_roles sr, c
    where sr.server_id = c.server_id and coalesce((sr.permissions ->> 'manage_channels')::boolean, false)
  ),
  allowed as (
    select sr.id, sr.is_default
    from public.server_roles sr
    join c on sr.server_id = c.server_id
    left join public.channel_permissions cp on cp.channel_id = p_channel_id and cp.role_id = sr.id
    where coalesce(cp.can_view, true) or sr.id in (select id from manage)
  ),
  everyone as (
    select exists (select 1 from allowed where is_default) as e
  )
  select m.user_id
  from public.server_members m, c, open, everyone
  where m.server_id = c.server_id
    and (
      open.o or everyone.e
      or m.role in ('owner', 'admin')
      or m.user_id = c.owner_id
      or m.role_id in (select id from manage)
      or exists (
        select 1 from public.member_roles mr
        where mr.server_id = c.server_id and mr.user_id = m.user_id
          and mr.role_id in (select id from allowed)
      )
    );
$$;

revoke all on function public.channel_viewers(uuid) from public, anon, authenticated;

create or replace function public.get_channel_member_counts(p_channel_id uuid)
returns table (total bigint, online bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.channels c where c.id = p_channel_id)
     or not public.channel_user_can_view(p_channel_id) then
    raise exception 'Channel not available';
  end if;
  return query
    select count(*)::bigint,
           count(*) filter (where coalesce(p.status, 'offline') in ('online', 'idle', 'dnd'))::bigint
    from public.channel_viewers(p_channel_id) v
    left join public.profiles p on p.id = v.user_id;
end;
$$;

create or replace function public.get_channel_members_by_ids(p_channel_id uuid, p_user_ids uuid[])
returns table (server_id uuid, user_id uuid, role text, joined_at timestamptz, role_id uuid, role_ids uuid[], profile jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select m.server_id, m.user_id, m.role, m.joined_at, m.role_id,
         array(select mr.role_id from public.member_roles mr where mr.server_id = m.server_id and mr.user_id = m.user_id),
         to_jsonb(p)
  from public.channels c
  join public.server_members m on m.server_id = c.server_id
  left join public.profiles p on p.id = m.user_id
  where c.id = p_channel_id
    and public.channel_user_can_view(p_channel_id)
    and m.user_id = any(coalesce(p_user_ids, '{}'::uuid[]))
    and m.user_id in (select v.user_id from public.channel_viewers(p_channel_id) v)
  limit 1000;
$$;

create or replace function public.get_channel_offline_members(
  p_channel_id uuid, p_exclude uuid[], p_offset integer, p_limit integer
)
returns table (server_id uuid, user_id uuid, role text, joined_at timestamptz, role_id uuid, role_ids uuid[], profile jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select m.server_id, m.user_id, m.role, m.joined_at, m.role_id,
         array(select mr.role_id from public.member_roles mr where mr.server_id = m.server_id and mr.user_id = m.user_id),
         to_jsonb(p)
  from public.channels c
  join public.server_members m on m.server_id = c.server_id
  left join public.profiles p on p.id = m.user_id
  where c.id = p_channel_id
    and public.channel_user_can_view(p_channel_id)
    and not (m.user_id = any(coalesce(p_exclude, '{}'::uuid[])))
    and m.user_id in (select v.user_id from public.channel_viewers(p_channel_id) v)
  order by lower(coalesce(nullif(p.display_name, ''), p.username, '')), m.user_id
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

-- ---------------------------------------------------------------------------
-- 0189: the member list follows the open channel, and updates live.
--
--   1. channel_member_can_view() answers "can this member see this channel"
--      for any member, set-based, with the same rules as
--      channel_permission_for(): owner/admin, manage_channels, a channel
--      with no overrides, or any of the member's roles (plus @everyone)
--      not denied view.
--   2. get_channel_member_counts / _members_by_ids / _offline_members are
--      the windowed member-list RPCs scoped to one channel, so a private
--      channel lists only the people who can actually read it.
--   3. server_members, member_roles, server_roles and channel_permissions
--      are not in the Realtime publication, so the client's change feeds on
--      them never fired: kicks and role changes only showed after a restart.
--      Statement-level triggers now send one "roster" broadcast per space
--      per statement (a bulk auto-join is one message, not thousands). The
--      payload is only the space id; clients re-read through the RPCs above.
-- ---------------------------------------------------------------------------

create or replace function public.channel_member_can_view(
  p_channel_id uuid, p_server_id uuid, p_user_id uuid, p_role text, p_role_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(p_role, '') in ('owner', 'admin')
    or exists (select 1 from public.servers s where s.id = p_server_id and s.owner_id = p_user_id)
    or not exists (select 1 from public.channel_permissions cp where cp.channel_id = p_channel_id)
    -- manage_channels on the legacy role or any assigned role.
    or exists (
      select 1 from public.server_roles sr
      where sr.server_id = p_server_id
        and coalesce((sr.permissions ->> 'manage_channels')::boolean, false)
        and (sr.id = p_role_id or exists (
          select 1 from public.member_roles mr
          where mr.server_id = p_server_id and mr.user_id = p_user_id and mr.role_id = sr.id))
    )
    -- Any of the member's roles, or @everyone, not denied view.
    or exists (
      select 1
      from (
        select mr.role_id from public.member_roles mr
        where mr.server_id = p_server_id and mr.user_id = p_user_id
        union
        select sr.id from public.server_roles sr
        where sr.server_id = p_server_id and sr.is_default
      ) r
      left join public.channel_permissions cp on cp.channel_id = p_channel_id and cp.role_id = r.role_id
      where coalesce(cp.can_view, true)
    );
$$;

revoke all on function public.channel_member_can_view(uuid, uuid, uuid, text, uuid) from public, anon, authenticated;

create or replace function public.get_channel_member_counts(p_channel_id uuid)
returns table (total bigint, online bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_server uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select c.server_id into v_server from public.channels c where c.id = p_channel_id;
  if v_server is null or not public.channel_user_can_view(p_channel_id) then
    raise exception 'Channel not available';
  end if;
  return query
    select count(*)::bigint,
           count(*) filter (where coalesce(p.status, 'offline') in ('online', 'idle', 'dnd'))::bigint
    from public.server_members m
    left join public.profiles p on p.id = m.user_id
    where m.server_id = v_server
      and public.channel_member_can_view(p_channel_id, v_server, m.user_id, m.role, m.role_id);
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
    and public.channel_member_can_view(p_channel_id, c.server_id, m.user_id, m.role, m.role_id)
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
    and public.channel_member_can_view(p_channel_id, c.server_id, m.user_id, m.role, m.role_id)
  order by lower(coalesce(nullif(p.display_name, ''), p.username, '')), m.user_id
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

revoke all on function public.get_channel_member_counts(uuid) from public, anon;
revoke all on function public.get_channel_members_by_ids(uuid, uuid[]) from public, anon;
revoke all on function public.get_channel_offline_members(uuid, uuid[], integer, integer) from public, anon;
grant execute on function public.get_channel_member_counts(uuid) to authenticated;
grant execute on function public.get_channel_members_by_ids(uuid, uuid[]) to authenticated;
grant execute on function public.get_channel_offline_members(uuid, uuid[], integer, integer) to authenticated;

-- Roster change pings. Every trigger below names its transition table
-- `changed`, so one function serves them all.
create or replace function public.broadcast_roster_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_server uuid;
begin
  for v_server in
    execute case tg_table_name
      when 'channel_permissions' then
        'select distinct c.server_id from changed x join public.channels c on c.id = x.channel_id'
      else
        'select distinct x.server_id from changed x'
    end
  loop
    begin
      perform realtime.send(
        jsonb_build_object('server_id', v_server, 'table', tg_table_name),
        'roster',
        'server-roster:' || v_server::text,
        false
      );
    exception when others then
      -- A Realtime hiccup must never block a kick or role change.
      null;
    end;
  end loop;
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['server_members', 'member_roles', 'server_roles', 'channel_permissions'] loop
    execute format('drop trigger if exists trg_roster_ins on public.%I', t);
    execute format('drop trigger if exists trg_roster_del on public.%I', t);
    execute format('drop trigger if exists trg_roster_upd on public.%I', t);
    execute format('create trigger trg_roster_ins after insert on public.%I referencing new table as changed for each statement execute function public.broadcast_roster_change()', t);
    execute format('create trigger trg_roster_del after delete on public.%I referencing old table as changed for each statement execute function public.broadcast_roster_change()', t);
    execute format('create trigger trg_roster_upd after update on public.%I referencing new table as changed for each statement execute function public.broadcast_roster_change()', t);
  end loop;
end
$$;

-- Member permission RPCs. Deploy after 0241_channel_member_permissions_storage.sql.
-- These RPCs only manage overrides. They do NOT change effective access checks.
-- Review against production schema and authorization rules before deployment.

create or replace function public.can_manage_channel_member_permissions(p_channel_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.channels c
    join public.server_members sm
      on sm.server_id = c.server_id and sm.user_id = (select auth.uid())
    where c.id = p_channel_id
      and (
        sm.role in ('owner', 'admin')
        or exists (
          select 1
          from public.member_roles mr
          join public.server_roles sr on sr.id = mr.role_id
          where mr.server_id = c.server_id
            and mr.user_id = sm.user_id
            and sr.server_id = c.server_id
            and (
              coalesce((sr.permissions ->> 'administrator')::boolean, false)
              or coalesce((sr.permissions ->> 'manage_channels')::boolean, false)
            )
        )
      )
  );
$$;

revoke all on function public.can_manage_channel_member_permissions(uuid) from public, anon;
grant execute on function public.can_manage_channel_member_permissions(uuid) to authenticated;

create or replace function public.get_channel_member_permissions(p_channel_id uuid)
returns table (
  user_id uuid,
  username text,
  can_view boolean,
  can_post boolean,
  can_react boolean,
  can_attach boolean
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.can_manage_channel_member_permissions(p_channel_id) then
    raise exception 'Not authorized to manage channel permissions' using errcode = '42501';
  end if;
  return query
    select cmp.user_id, coalesce(p.username, cmp.user_id::text),
           cmp.can_view, cmp.can_post, cmp.can_react, cmp.can_attach
    from public.channel_member_permissions cmp
    left join public.profiles p on p.id = cmp.user_id
    where cmp.channel_id = p_channel_id
    order by 2;
end;
$$;

create or replace function public.set_channel_member_permission(
  p_channel_id uuid, p_user_id uuid,
  p_can_view boolean default null, p_can_post boolean default null,
  p_can_react boolean default null, p_can_attach boolean default null
)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_server_id uuid;
begin
  if not public.can_manage_channel_member_permissions(p_channel_id) then
    raise exception 'Not authorized to manage channel permissions' using errcode = '42501';
  end if;
  select c.server_id into v_server_id from public.channels c where c.id = p_channel_id;
  if not exists (
    select 1 from public.server_members sm
    where sm.server_id = v_server_id and sm.user_id = p_user_id
  ) then
    raise exception 'User is not a member of this server' using errcode = '22023';
  end if;
  if p_can_view is null and p_can_post is null
     and p_can_react is null and p_can_attach is null then
    delete from public.channel_member_permissions
    where channel_id = p_channel_id and user_id = p_user_id;
    return;
  end if;
  insert into public.channel_member_permissions
    (channel_id, user_id, can_view, can_post, can_react, can_attach)
  values
    (p_channel_id, p_user_id, p_can_view, p_can_post, p_can_react, p_can_attach)
  on conflict (channel_id, user_id) do update set
    can_view = excluded.can_view,
    can_post = excluded.can_post,
    can_react = excluded.can_react,
    can_attach = excluded.can_attach,
    updated_at = now();
end;
$$;

create or replace function public.remove_channel_member_permission(
  p_channel_id uuid, p_user_id uuid
)
returns void language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.can_manage_channel_member_permissions(p_channel_id) then
    raise exception 'Not authorized to manage channel permissions' using errcode = '42501';
  end if;
  delete from public.channel_member_permissions
  where channel_id = p_channel_id and user_id = p_user_id;
end;
$$;

revoke all on function public.get_channel_member_permissions(uuid) from public, anon;
revoke all on function public.set_channel_member_permission(uuid, uuid, boolean, boolean, boolean, boolean) from public, anon;
revoke all on function public.remove_channel_member_permission(uuid, uuid) from public, anon;
grant execute on function public.get_channel_member_permissions(uuid) to authenticated;
grant execute on function public.set_channel_member_permission(uuid, uuid, boolean, boolean, boolean, boolean) to authenticated;
grant execute on function public.remove_channel_member_permission(uuid, uuid) to authenticated;

-- Server channel management + manage_channels role permission.
--
-- Adds a `manage_channels` key to role permissions, extends the permission
-- RPCs, relaxes channel/category/role RLS so delegated moderators can manage
-- channels, and adds create/rename/delete channel + delete role RPCs.

-- ---------------------------------------------------------------------------
-- 1. manage_channels on server_roles
-- ---------------------------------------------------------------------------
alter table public.server_roles
  alter column permissions set default '{"kick":false,"ban":false,"manage_roles":false,"manage_server":false,"manage_channels":false}'::jsonb;

update public.server_roles
set permissions = permissions || '{"manage_channels":false}'::jsonb
where not (permissions ? 'manage_channels');

-- ---------------------------------------------------------------------------
-- 2. my_server_permissions now includes manage_channels
-- ---------------------------------------------------------------------------
create or replace function public.my_server_permissions(p_server_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'kick', public.member_has_server_permission(p_server_id, v_uid, 'kick'),
    'ban', public.member_has_server_permission(p_server_id, v_uid, 'ban'),
    'manage_roles', public.member_has_server_permission(p_server_id, v_uid, 'manage_roles'),
    'manage_server', public.member_has_server_permission(p_server_id, v_uid, 'manage_server'),
    'manage_channels', public.member_has_server_permission(p_server_id, v_uid, 'manage_channels')
  );
end;
$$;

grant execute on function public.my_server_permissions(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. RLS: allow manage_channels to mutate channels/categories, and
--    manage_roles to mutate roles
-- ---------------------------------------------------------------------------
drop policy if exists "categories_mutate_admin" on public.channel_categories;
create policy "categories_mutate_admin" on public.channel_categories for all to authenticated
  using (
    public.is_server_admin(server_id)
    or public.is_server_owner(server_id)
    or public.member_has_server_permission(server_id, auth.uid(), 'manage_channels')
  )
  with check (
    public.is_server_admin(server_id)
    or public.is_server_owner(server_id)
    or public.member_has_server_permission(server_id, auth.uid(), 'manage_channels')
  );

drop policy if exists "channels_mutate_admin" on public.channels;
create policy "channels_mutate_admin" on public.channels for all to authenticated
  using (
    public.is_server_admin(server_id)
    or public.is_server_owner(server_id)
    or public.member_has_server_permission(server_id, auth.uid(), 'manage_channels')
  )
  with check (
    public.is_server_admin(server_id)
    or public.is_server_owner(server_id)
    or public.member_has_server_permission(server_id, auth.uid(), 'manage_channels')
  );

drop policy if exists "roles_mutate_admin" on public.server_roles;
create policy "roles_mutate_admin" on public.server_roles for all to authenticated
  using (
    public.is_server_admin(server_id)
    or public.is_server_owner(server_id)
    or public.member_has_server_permission(server_id, auth.uid(), 'manage_roles')
  )
  with check (
    public.is_server_admin(server_id)
    or public.is_server_owner(server_id)
    or public.member_has_server_permission(server_id, auth.uid(), 'manage_roles')
  );

-- ---------------------------------------------------------------------------
-- 4. Channel management RPCs
-- ---------------------------------------------------------------------------
create or replace function public.create_channel(
  p_server_id uuid,
  p_name text,
  p_type text default 'text',
  p_category_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_pos int;
begin
  if p_type not in ('text', 'voice') then
    raise exception 'Invalid channel type';
  end if;
  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'Channel name is required';
  end if;
  if not public.member_has_server_permission(p_server_id, auth.uid(), 'manage_channels') then
    raise exception 'Insufficient permissions';
  end if;

  select coalesce(max(position), -1) + 1 into v_pos
  from public.channels where server_id = p_server_id;

  insert into public.channels (server_id, category_id, name, type, position)
  values (p_server_id, p_category_id, lower(btrim(p_name)), p_type, v_pos)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.rename_channel(p_channel_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_server_id uuid;
begin
  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'Channel name is required';
  end if;
  select server_id into v_server_id from public.channels where id = p_channel_id;
  if v_server_id is null then
    raise exception 'Channel not found';
  end if;
  if not public.member_has_server_permission(v_server_id, auth.uid(), 'manage_channels') then
    raise exception 'Insufficient permissions';
  end if;
  update public.channels set name = lower(btrim(p_name)) where id = p_channel_id;
end;
$$;

create or replace function public.delete_channel(p_channel_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_server_id uuid;
begin
  select server_id into v_server_id from public.channels where id = p_channel_id;
  if v_server_id is null then
    return;
  end if;
  if not public.member_has_server_permission(v_server_id, auth.uid(), 'manage_channels') then
    raise exception 'Insufficient permissions';
  end if;
  delete from public.channels where id = p_channel_id;
end;
$$;

grant execute on function public.create_channel(uuid, text, text, uuid) to authenticated;
grant execute on function public.rename_channel(uuid, text) to authenticated;
grant execute on function public.delete_channel(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Role deletion (default role is protected)
-- ---------------------------------------------------------------------------
create or replace function public.delete_server_role(p_role_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_server_id uuid;
  v_is_default boolean;
begin
  select server_id, is_default into v_server_id, v_is_default
  from public.server_roles where id = p_role_id;
  if v_server_id is null then
    return;
  end if;
  if not public.member_has_server_permission(v_server_id, auth.uid(), 'manage_roles') then
    raise exception 'Insufficient permissions';
  end if;
  if v_is_default then
    raise exception 'Cannot delete the default role';
  end if;
  delete from public.server_roles where id = p_role_id;
end;
$$;

grant execute on function public.delete_server_role(uuid) to authenticated;

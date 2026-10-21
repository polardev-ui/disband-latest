-- ---------------------------------------------------------------------------
-- 0141: role assignment requires both manage_roles and manage_server
--
-- The profile UI already gated role editing on `manage_roles && manage_server`,
-- but a client could call set_member_roles (or write member_roles directly)
-- with only `manage_roles`. Align the database with the UI: owners and
-- server admins can always assign roles, and a custom role must hold both
-- permissions. This keeps role assignment in the hands of space admins rather
-- than anyone who happens to have one of the two permissions.
-- ---------------------------------------------------------------------------

drop policy if exists "member_roles_insert" on public.member_roles;
create policy "member_roles_insert" on public.member_roles for insert to authenticated
  with check (
    public.is_server_admin(server_id)
    or public.is_server_owner(server_id)
    or (
      public.member_has_server_permission(server_id, auth.uid(), 'manage_roles')
      and public.member_has_server_permission(server_id, auth.uid(), 'manage_server')
    )
  );

drop policy if exists "member_roles_delete" on public.member_roles;
create policy "member_roles_delete" on public.member_roles for delete to authenticated
  using (
    public.is_server_admin(server_id)
    or public.is_server_owner(server_id)
    or (
      public.member_has_server_permission(server_id, auth.uid(), 'manage_roles')
      and public.member_has_server_permission(server_id, auth.uid(), 'manage_server')
    )
  );

create or replace function public.set_member_roles(
  p_server_id uuid,
  p_user_id uuid,
  p_role_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Owners and admins can always assign roles. A custom role needs both
  -- management permissions, matching the profile UI.
  if not (
    public.is_server_owner(p_server_id)
    or public.is_server_admin(p_server_id)
    or (
      public.member_has_server_permission(p_server_id, v_uid, 'manage_roles')
      and public.member_has_server_permission(p_server_id, v_uid, 'manage_server')
    )
  ) then
    raise exception 'You do not have permission to manage roles.';
  end if;

  -- Target must be a member of the server.
  if not exists (
    select 1 from public.server_members
    where server_id = p_server_id and user_id = p_user_id
  ) then
    raise exception 'That user is not a member of this server.';
  end if;

  -- The owner's roles are untouchable.
  if exists (
    select 1 from public.servers where id = p_server_id and owner_id = p_user_id
  ) then
    raise exception 'The server owner cannot be assigned roles.';
  end if;

  -- Every role must belong to this server and be assignable (not @everyone).
  if p_role_ids is not null then
    foreach v_role in array p_role_ids loop
      if not exists (
        select 1 from public.server_roles
        where id = v_role and server_id = p_server_id and not is_default
      ) then
        raise exception 'Invalid role for this server.';
      end if;
    end loop;
  end if;

  -- Replace the member's role stack.
  delete from public.member_roles
  where server_id = p_server_id and user_id = p_user_id;

  if p_role_ids is not null then
    foreach v_role in array p_role_ids loop
      insert into public.member_roles (server_id, user_id, role_id)
      values (p_server_id, p_user_id, v_role)
      on conflict (server_id, user_id, role_id) do nothing;
    end loop;
  end if;

  -- Keep the legacy single role_id pointing at the highest-priority role.
  update public.server_members sm
  set role_id = (
    select mr.role_id
    from public.member_roles mr
    join public.server_roles r on r.id = mr.role_id
    where mr.server_id = p_server_id and mr.user_id = p_user_id
    order by r.position desc
    limit 1
  )
  where sm.server_id = p_server_id and sm.user_id = p_user_id;
end;
$$;

revoke all on function public.set_member_roles(uuid, uuid, uuid[]) from public;
grant execute on function public.set_member_roles(uuid, uuid, uuid[]) to authenticated;

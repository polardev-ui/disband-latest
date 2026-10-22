-- 0158: self-assignable roles
--
-- Server roles have always been staff-managed: set_member_roles requires
-- manage_roles AND manage_server, and the member surfaces hide the role
-- picker for the signed-in user. That is the wrong default for a large
-- community, where colour, interest, and ping roles are meant to be chosen by
-- the member.
--
-- This adds an explicit opt-in flag per role. Staff decide which roles are
-- safe for members to hold; everything else stays staff-only. The new RPC
-- removes and replaces only the caller's self-assigned roles, so a role a
-- moderator granted by hand is never stripped by a member toggling a colour.

alter table public.server_roles
  add column if not exists self_assignable boolean not null default false;

comment on column public.server_roles.self_assignable is
  'When true, members may add or remove this role from their own profile. Staff-granted roles that are not self_assignable are never touched by the self-role RPC.';

create or replace function public.set_self_member_roles(
  p_server_id uuid,
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

  if not exists (
    select 1 from public.server_members
    where server_id = p_server_id and user_id = v_uid
  ) then
    raise exception 'You are not a member of this server.';
  end if;

  if p_role_ids is not null then
    if coalesce(array_length(p_role_ids, 1), 0) > 10 then
      raise exception 'You can choose up to 10 roles.';
    end if;

    foreach v_role in array p_role_ids loop
      if not exists (
        select 1 from public.server_roles
        where id = v_role
          and server_id = p_server_id
          and not is_default
          and self_assignable
      ) then
        raise exception 'That role is not available for self-assignment.';
      end if;
    end loop;
  end if;

  -- Only self-assignable roles are replaced. A moderator can hand out a
  -- private or staff role and a member picking a colour role will keep it.
  delete from public.member_roles mr
  using public.server_roles r
  where mr.server_id = p_server_id
    and mr.user_id = v_uid
    and mr.role_id = r.id
    and r.server_id = p_server_id
    and r.self_assignable
    and not r.is_default;

  if p_role_ids is not null then
    foreach v_role in array p_role_ids loop
      insert into public.member_roles (server_id, user_id, role_id)
      values (p_server_id, v_uid, v_role)
      on conflict (server_id, user_id, role_id) do nothing;
    end loop;
  end if;

  update public.server_members sm
  set role_id = (
    select mr.role_id
    from public.member_roles mr
    join public.server_roles r on r.id = mr.role_id
    where mr.server_id = p_server_id and mr.user_id = v_uid
    order by r.position desc
    limit 1
  )
  where sm.server_id = p_server_id and sm.user_id = v_uid;
end;
$$;

revoke all on function public.set_self_member_roles(uuid, uuid[]) from public;
grant execute on function public.set_self_member_roles(uuid, uuid[]) to authenticated;

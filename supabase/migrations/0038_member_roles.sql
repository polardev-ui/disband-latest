-- 0038: Multiple roles per member (Discord-style role stacks)
--
-- server_members.role_id (the legacy single column) is kept as the *primary*
-- role — the highest-position role a member holds — so existing single-role
-- code (member list grouping, name colours, message author colours) keeps
-- working. The join table below is the source of truth for the full stack.

create table if not exists public.member_roles (
  server_id  uuid not null references public.servers (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role_id    uuid not null references public.server_roles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (server_id, user_id, role_id)
);

create index if not exists member_roles_member_idx on public.member_roles (server_id, user_id);
create index if not exists member_roles_role_idx on public.member_roles (role_id);

-- When a member leaves or is kicked, their role rows must go too.
alter table public.member_roles
  add constraint member_roles_member_fk
  foreign key (server_id, user_id)
  references public.server_members (server_id, user_id)
  on delete cascade;

alter table public.member_roles enable row level security;

-- Any server member can read role assignments (they are shown on profiles).
drop policy if exists "member_roles_select" on public.member_roles;
create policy "member_roles_select" on public.member_roles for select to authenticated
  using (public.is_server_member(server_id));

-- Assignment changes normally go through set_member_roles (SECURITY DEFINER,
-- atomic). These policies are a backstop so direct writes still require the
-- same permission the UI checks.
drop policy if exists "member_roles_insert" on public.member_roles;
create policy "member_roles_insert" on public.member_roles for insert to authenticated
  with check (
    public.is_server_admin(server_id)
    or public.is_server_owner(server_id)
    or public.member_has_server_permission(server_id, auth.uid(), 'manage_roles')
  );

drop policy if exists "member_roles_delete" on public.member_roles;
create policy "member_roles_delete" on public.member_roles for delete to authenticated
  using (
    public.is_server_admin(server_id)
    or public.is_server_owner(server_id)
    or public.member_has_server_permission(server_id, auth.uid(), 'manage_roles')
  );

-- Carry over existing single-role assignments so no one loses a role.
insert into public.member_roles (server_id, user_id, role_id)
select server_id, user_id, role_id
from public.server_members
where role_id is not null
on conflict (server_id, user_id, role_id) do nothing;

-- ---------------------------------------------------------------------------
-- Atomic multi-role replacement
-- ---------------------------------------------------------------------------
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

  -- Caller must be able to manage roles in this server.
  if not (
    public.is_server_owner(p_server_id)
    or public.is_server_admin(p_server_id)
    or public.member_has_server_permission(p_server_id, v_uid, 'manage_roles')
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

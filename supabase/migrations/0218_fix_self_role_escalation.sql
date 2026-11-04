-- 0218_fix_self_role_escalation.sql
-- Vulnerability: server_members_update allowed a member to UPDATE their own row,
-- including role_id, bypassing the member_roles RLS and set_member_roles checks.
-- A user could set role_id to a role with ban/manage permissions and then ban
-- anyone. Remove self-update and guard role_id changes.

drop policy if exists "server_members_update" on public.server_members;
create policy "server_members_update" on public.server_members
  for update to authenticated
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

-- Extend the role guard to cover role_id changes too.
create or replace function public.guard_server_member_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_authorized boolean;
begin
  v_authorized := public.is_server_admin(new.server_id)
    or public.is_server_owner(new.server_id)
    or (
      public.member_has_server_permission(new.server_id, auth.uid(), 'manage_roles')
      and public.member_has_server_permission(new.server_id, auth.uid(), 'manage_server')
    );

  if tg_op = 'INSERT' then
    if new.role in ('owner', 'admin') and not public.is_server_owner(new.server_id) then
      raise exception 'Only the server owner can assign privileged roles.' using errcode = 'P0001';
    end if;
    if new.role_id is not null and not v_authorized then
      raise exception 'You do not have permission to assign roles.' using errcode = 'P0001';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.role is distinct from old.role and not public.is_server_owner(new.server_id) then
      raise exception 'Only the server owner can change member roles.' using errcode = 'P0001';
    end if;
    if new.role_id is distinct from old.role_id and not v_authorized then
      raise exception 'You do not have permission to change member roles.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

-- Re-create trigger (definition unchanged but ensure it's active)
drop trigger if exists server_members_role_guard on public.server_members;
create trigger server_members_role_guard
  before insert or update on public.server_members
  for each row execute function public.guard_server_member_role();
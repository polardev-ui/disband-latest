-- 0067: set_member_roles returned "Invalid role for this server." (HTTP 400)
-- whenever the client sent the @everyone role id.
--
-- Root cause: several create/join paths stored the @everyone (is_default) role
-- id in server_members.role_id, and migration 0038's one-shot backfill copied
-- every server_members.role_id into member_roles — including @everyone. The
-- member list then surfaced those ids as role_ids and toggling a role
-- re-submitted them to set_member_roles, which (correctly) refuses default
-- roles → 400 on every role edit for those members.

-- 1. Purge @everyone assignments from the join table.
delete from public.member_roles mr
using public.server_roles r
where r.id = mr.role_id and r.is_default;

-- 2. Drop @everyone from the legacy column too. It is meaningless as a "best"
-- role and its presence made client fallback paths pass the id back to
-- set_member_roles. (@everyone still applies to everyone via role lookup, so
-- nothing about permissions or grouping changes by nulling it.)
update public.server_members sm
set role_id = null
where sm.role_id is not null
  and exists (
    select 1 from public.server_roles r
    where r.id = sm.role_id and r.is_default
  );

-- 3. Backstop: direct member_roles inserts must not be able to reintroduce a
-- default role (set_member_roles already enforces this internally).
drop policy if exists "member_roles_insert" on public.member_roles;
create policy "member_roles_insert" on public.member_roles for insert to authenticated
  with check (
    exists (
      select 1 from public.server_roles r
      where r.id = role_id and not r.is_default
    )
    and (
      public.is_server_admin(server_id)
      or public.is_server_owner(server_id)
      or public.member_has_server_permission(server_id, auth.uid(), 'manage_roles')
    )
  );
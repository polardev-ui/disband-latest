-- 0137: Stop classifying members under the implicit @everyone role.
delete from public.member_roles mr
using public.server_roles r
where r.id = mr.role_id and r.is_default;

update public.server_members sm
set role_id = null
where sm.role_id is not null
  and exists (select 1 from public.server_roles r where r.id = sm.role_id and r.is_default);

create or replace function public.null_default_member_role()
returns trigger language plpgsql as $$
begin
  if new.role_id is not null and exists (
    select 1 from public.server_roles r where r.id = new.role_id and r.is_default
  ) then
    new.role_id := null;
  end if;
  return new;
end; $$;

drop trigger if exists server_members_null_default_role on public.server_members;
create trigger server_members_null_default_role
  before insert or update of role_id on public.server_members
  for each row execute function public.null_default_member_role();
-- 0220_guard_profile_sensitive_columns_insert.sql
-- Extend the sensitive-column guard to INSERT as well, so a self-inserted
-- profile row cannot claim support-staff/owner/staff badges or anonymous type.

create or replace function public.guard_profile_sensitive_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_manager boolean := false;
begin
  if v_actor is null then
    return new;
  end if;

  v_manager := public.is_platform_manager(v_actor) or public.is_platform_owner(v_actor);

  if tg_op = 'INSERT' then
    if not v_manager and new.id = v_actor then
      new.is_support_staff := false;
      new.show_owner_badge := false;
      new.show_staff_badge := false;
      new.account_type := 'standard';
      new.is_bot := false;
      new.bot_dm_enabled := false;
    end if;
    return new;
  end if;

  if not v_manager and new.id = v_actor then
    new.is_support_staff := old.is_support_staff;
    new.show_owner_badge := old.show_owner_badge;
    new.show_staff_badge := old.show_staff_badge;
    new.account_type := old.account_type;
    new.is_bot := old.is_bot;
    new.bot_dm_enabled := old.bot_dm_enabled;
    new.deletion_requested_at := old.deletion_requested_at;
    new.deletion_cancel_until := old.deletion_cancel_until;
    new.deletion_purge_at := old.deletion_purge_at;
  end if;

  if not v_manager and new.id is distinct from v_actor then
    new.is_support_staff := old.is_support_staff;
    new.show_owner_badge := old.show_owner_badge;
    new.show_staff_badge := old.show_staff_badge;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profile_sensitive_columns on public.profiles;
create trigger guard_profile_sensitive_columns
  before insert or update on public.profiles
  for each row execute function public.guard_profile_sensitive_columns();
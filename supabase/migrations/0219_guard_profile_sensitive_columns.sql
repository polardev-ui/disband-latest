-- 0219_guard_profile_sensitive_columns.sql
-- Vulnerability: profiles_update_own allowed a user to update their own row,
-- including is_support_staff, show_owner_badge, show_staff_badge, account_type,
-- and is_bot. A user could grant themselves platform staff/owner badges and
-- then access platform bans, flags, and emails. Guard these columns so only
-- platform managers/owners (or service role) can change them.

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
    -- service role / trusted backend: allow.
    return new;
  end if;

  v_manager := public.is_platform_manager(v_actor) or public.is_platform_owner(v_actor);

  if not v_manager and new.id = v_actor then
    -- Self-update: ignore changes to sensitive columns.
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

  -- Non-managers cannot change sensitive columns even for other users
  -- (RLS already restricts, but defense in depth).
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
  before update on public.profiles
  for each row execute function public.guard_profile_sensitive_columns();
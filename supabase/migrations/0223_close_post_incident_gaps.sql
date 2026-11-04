-- 0223: Close the escalation gaps found in the post-incident audit (2026-11-04).
--
-- Each of these was confirmed as an ordinary signed-in user, inside a
-- rolled-back transaction, before this migration was written.
--
-- 1. A space owner could lift a platform suspension on their own space by
--    writing suspended_at / suspended_reason / suspended_by through the
--    servers_update_owner policy, and could mark it AI-checked to skip the
--    Sentinel scan. Only Disband managers (via manager_suspend_server) and the
--    service role may change those columns now.
-- 2. Any member could insert a row into server_boosts for free, which
--    refresh_user_badges counts as boosting and awards the paid Booster badge.
--    No client writes this table; boosts come from Catalysts server-side.
-- 3. show_og_badge and show_bounty_badge were self-settable. They are not
--    read for display today, but they are badge flags and should not be
--    writable by their owner.

-- 1. Suspension and AI-check columns on servers --------------------------------
create or replace function public.guard_server_moderation_fields()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Service role, cron and edge functions run without a user.
  if auth.uid() is null then
    return new;
  end if;
  if public.is_platform_manager(auth.uid()) or public.is_platform_owner(auth.uid()) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.suspended_at := null;
    new.suspended_reason := null;
    new.suspended_by := null;
    new.ai_checked_at := null;
  else
    new.suspended_at := old.suspended_at;
    new.suspended_reason := old.suspended_reason;
    new.suspended_by := old.suspended_by;
    new.ai_checked_at := old.ai_checked_at;
  end if;
  return new;
end;
$$;

drop trigger if exists servers_guard_moderation_fields on public.servers;
create trigger servers_guard_moderation_fields
  before insert or update on public.servers
  for each row execute function public.guard_server_moderation_fields();

-- 2. Free boosts ------------------------------------------------------------------
drop policy if exists "Users can boost joined servers" on public.server_boosts;
revoke insert, update on public.server_boosts from authenticated, anon;

-- 3. Badge flags on profiles --------------------------------------------------------
create or replace function public.guard_profile_badge_flags()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null
     or public.is_platform_manager(auth.uid())
     or public.is_platform_owner(auth.uid()) then
    return new;
  end if;
  -- Staff award Bug Bounty to reporters through resolve_bug_report: allowed
  -- for someone else's profile, never your own.
  if new.id is distinct from auth.uid() and public.is_platform_staff(auth.uid()) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.show_og_badge := false;
    new.show_bounty_badge := false;
  else
    new.show_og_badge := old.show_og_badge;
    new.show_bounty_badge := old.show_bounty_badge;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_badge_flags on public.profiles;
create trigger profiles_guard_badge_flags
  before insert or update on public.profiles
  for each row execute function public.guard_profile_badge_flags();

revoke execute on function public.guard_server_moderation_fields() from public, anon, authenticated;
revoke execute on function public.guard_profile_badge_flags() from public, anon, authenticated;

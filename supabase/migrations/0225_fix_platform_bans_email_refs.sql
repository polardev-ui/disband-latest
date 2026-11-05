-- 0225: 0221 dropped platform_bans.email, but two functions still read it.
--
-- 1. prevent_banned_email_signup (BEFORE INSERT on auth.users) failed with
--    "column pb.email does not exist" for every new account, so every email
--    sign-up returned a 500 from 4 Nov 16:30 UTC until this migration.
-- 2. sentinel_suspend wrote the email into the ban, so Sentinel's automatic
--    bans failed the same way.
--
-- Banned emails are now found through account_emails (user_id -> canonical
-- email, service-role only), as /api/auth/signup-check already does.

create or replace function public.prevent_banned_email_signup()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.email is not null and exists (
    select 1
      from public.account_emails ae
      join public.platform_bans pb on pb.user_id = ae.user_id
     where ae.canonical = lower(trim(new.email))
  ) then
    raise exception 'This email cannot create an account while a platform ban is active.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function public.sentinel_suspend(p_user uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_new boolean := false;
begin
  if p_user is null then return false; end if;

  select not exists (
    select 1 from public.platform_bans where user_id = p_user
  ) into v_new;

  insert into public.platform_bans (user_id, banned_by, reason)
  values (p_user, null, coalesce(p_reason, 'Automated safety enforcement'))
  on conflict (user_id) do nothing;

  -- Only write a moderation action for a genuinely new ban, so a second
  -- report cannot spam the account with duplicate suspension notices.
  if v_new then
    insert into public.moderation_actions (action, src_table, src_id, owner_id, reason)
    values ('suspend_user', 'profiles', p_user::text, p_user, p_reason);
  end if;

  return v_new;
end;
$$;

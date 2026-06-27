-- 0024_account_deletion.sql
-- Lets a signed-in user permanently delete their own account, as required by
-- App Store Review Guideline 5.1.1(v) (apps with account creation must offer
-- in-app account deletion).
--
-- Deleting the auth.users row cascades to public.profiles (FK on delete cascade)
-- and from there to every user-owned table (all reference profiles(id) on delete
-- cascade), so this single delete removes the account and all associated data.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  delete from auth.users where id = uid;
end;
$$;

-- Only authenticated users may call it; each call only ever affects the caller.
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

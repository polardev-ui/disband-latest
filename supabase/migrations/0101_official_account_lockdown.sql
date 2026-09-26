-- 0101_official_account_lockdown.sql
-- Turn @disband from "a person's account dressed up as a bot" into a system
-- identity that nobody can sign in to.
--
-- WHY
-- The profile with username 'disband' has is_bot = true and a staff badge, so it
-- reads as the official account everywhere in the app. But its auth user was a
-- real Gmail login with a usable password. Until this migration, anyone holding
-- those credentials could sign in as the official Disband account, post as it,
-- and read its DMs.
--
-- This account is NOT the platform owner account — it has show_owner_badge
-- false, and the owner is a separate profile — so locking it down does not
-- affect owner access.
--
-- Original address, kept here so this is reversible:
--     9ce115fe-ac34-4d35-af59-d3e09b7bc630  nullifybusiness1@gmail.com
-- To undo: set the email on that auth user back, confirm it, and reset the
-- password. Nothing in the schema references this address.
--
-- The new address is deliberately one nothing receives mail at. A password
-- reset against it cannot succeed, which is the point: the account has no
-- human to reset a password for.
--
-- The profile row itself is left alone — 0100 owns its bio and display name.

do $$
declare
  v_official  uuid;
  v_old_email text;
  v_reserved  constant text := 'no-reply@disband.dev';
begin
  select id into v_official
  from public.profiles
  where lower(username) = 'disband' and coalesce(is_bot, false)
  limit 1;

  if v_official is null then
    raise notice 'No @disband bot profile found; nothing to lock down.';
    return;
  end if;

  select email into v_old_email from auth.users where id = v_official;

  -- Nothing to do if the auth user is already gone, or already reserved.
  if v_old_email is null or v_old_email = v_reserved then
    raise notice 'Auth user for @disband already locked down (email: %)', coalesce(v_old_email, '(none)');
    return;
  end if;

  update auth.users
  set email = v_reserved,
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      -- Empty, not NULL and not a random hash. GoTrue refuses password
      -- sign-in outright when the stored password is empty (ErrPasswordNotSet),
      -- so the account cannot be signed into even with the old address, and
      -- this does not depend on pgcrypto being installed or on a hash format
      -- staying parseable forever.
      encrypted_password = '',
      updated_at = now()
  where id = v_official;

  raise notice 'Locked @disband (%, was %) onto %', v_official, v_old_email, v_reserved;
end
$$;

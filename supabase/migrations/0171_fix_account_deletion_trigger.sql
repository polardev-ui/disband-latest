-- 0171_fix_account_deletion_trigger.sql
-- request_account_deletion (0126) sets display_name = null to de-anonymise
-- the profile, but enforce_profile_update_limits (0031) raised
-- "Display name cannot be empty." and blocked the whole deletion. Allow
-- null display_name while a deletion is in progress.

create or replace function public.enforce_profile_update_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last timestamptz;
  v_count integer;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  -- Account deletion de-anonymises the profile (display_name becomes null).
  -- Skip the "display name required" check in that case.
  if new.deletion_requested_at is null then
    if new.display_name is null or length(trim(new.display_name)) = 0 then
      raise exception 'Display name cannot be empty.'
        using errcode = 'P0001';
    end if;
  end if;

  if new.username is null or length(trim(new.username)) = 0 then
    new.username := public.resolve_username(null, new.display_name, null, new.id);
  end if;

  if new.username is distinct from old.username then
    perform public.assert_username_available(new.username, new.id);

    v_count := public.profile_change_count(new.id, 'username', interval '24 hours');
    if v_count >= 10 then
      raise exception 'You can only change your username 10 times per day.'
        using errcode = 'P0001';
    end if;

    insert into public.profile_change_log (user_id, field) values (new.id, 'username');
  end if;

  if new.display_name is distinct from old.display_name then
    -- Skip rate limiting for deletion (display_name going to null).
    if new.deletion_requested_at is null then
      v_last := public.profile_last_change(new.id, 'display_name');
      if v_last is not null and v_last > now() - interval '20 seconds' then
        raise exception 'Wait 20 seconds before changing your display name again.'
          using errcode = 'P0001';
      end if;

      v_count := public.profile_change_count(new.id, 'display_name', interval '24 hours');
      if v_count >= 10 then
        raise exception 'You can only change your display name 10 times per day.'
          using errcode = 'P0001';
      end if;

      insert into public.profile_change_log (user_id, field) values (new.id, 'display_name');
    end if;
  end if;

  return new;
end;
$$;